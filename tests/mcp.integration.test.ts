import { createHash, randomBytes } from "node:crypto";
import { hash } from "@node-rs/argon2";
import { afterAll, beforeEach, describe, expect, it } from "vitest";
import { hasDb, resetDb } from "./db";
import { closeDb, db } from "@/server/db/client";
import { appUser } from "@/server/db/schema";
import { accounts, inbox, integrations, projects, tasks } from "@/server/api";
import { addDays, today } from "@/lib/dates";
import * as mcpRoute from "@/app/api/mcp/route";
import * as registerRoute from "@/app/api/oauth/register/route";
import * as authorizeRoute from "@/app/api/oauth/authorize/route";
import * as tokenRoute from "@/app/api/oauth/token/route";
import * as resourceMeta from "@/app/api/oauth/metadata/resource/route";
import * as serverMeta from "@/app/api/oauth/metadata/server/route";

const BASE = "https://catastif.example.com";
process.env.PUBLIC_URL = BASE;
const PASSWORD = "correct horse battery";

let rpcId = 0;
async function mcp(token: string | null, method: string, params: Record<string, unknown> = {}) {
  const res = await mcpRoute.POST(
    new Request(`${BASE}/api/mcp`, {
      method: "POST",
      headers: {
        ...(token ? { authorization: `Bearer ${token}` } : {}),
        "content-type": "application/json",
        accept: "application/json, text/event-stream",
        "mcp-protocol-version": "2025-06-18",
      },
      body: JSON.stringify({ jsonrpc: "2.0", id: ++rpcId, method, params }),
    }),
  );
  return { status: res.status, headers: res.headers, body: res.status === 200 ? await res.json() : await res.text() };
}

async function call(token: string, name: string, args: Record<string, unknown> = {}) {
  const r = await mcp(token, "tools/call", { name, arguments: args });
  expect(r.status).toBe(200);
  const result = r.body.result;
  const text = result.content[0].text as string;
  return { isError: !!result.isError, text, data: result.isError ? null : JSON.parse(text) };
}

const form = (o: Record<string, string>) => new URLSearchParams(o).toString();

describe.skipIf(!hasDb)("MCP + OAuth (integration)", () => {
  beforeEach(async () => {
    await resetDb();
    await db.insert(appUser).values({ passwordHash: await hash(PASSWORD) });
  });
  afterAll(closeDb);

  it("publishes discovery metadata and asks for auth with a pointer to it", async () => {
    const r = await mcp(null, "tools/list");
    expect(r.status).toBe(401);
    expect(r.headers.get("www-authenticate")).toContain(`resource_metadata="${BASE}/.well-known/oauth-protected-resource/api/mcp"`);
    const res = await (await resourceMeta.GET(new Request(`${BASE}/.well-known/oauth-protected-resource`))).json();
    expect(res).toMatchObject({ resource: `${BASE}/api/mcp`, authorization_servers: [BASE] });
    const as = await (await serverMeta.GET(new Request(`${BASE}/.well-known/oauth-authorization-server`))).json();
    expect(as).toMatchObject({
      issuer: BASE,
      authorization_endpoint: `${BASE}/api/oauth/authorize`,
      token_endpoint: `${BASE}/api/oauth/token`,
      registration_endpoint: `${BASE}/api/oauth/register`,
      code_challenge_methods_supported: ["S256"],
    });
  });

  it("runs the full Claude-style OAuth flow, then uses MCP with the granted scopes", async () => {
    // 1. Dynamic client registration
    const reg = await registerRoute.POST(
      new Request(`${BASE}/api/oauth/register`, {
        method: "POST",
        body: JSON.stringify({ client_name: "Claude", redirect_uris: ["https://claude.ai/api/mcp/auth_callback"], token_endpoint_auth_method: "none" }),
      }),
    );
    expect(reg.status).toBe(201);
    const client = await reg.json();
    expect(client.client_id).toMatch(/^cc_/);
    const bad = await registerRoute.POST(new Request(`${BASE}/api/oauth/register`, { method: "POST", body: JSON.stringify({ redirect_uris: ["http://evil.example/cb"] }) }));
    expect(bad.status).toBe(400);

    // 2. Authorization page
    const verifier = randomBytes(32).toString("base64url");
    const challenge = createHash("sha256").update(verifier).digest("base64url");
    const q = {
      response_type: "code",
      client_id: client.client_id,
      redirect_uri: "https://claude.ai/api/mcp/auth_callback",
      code_challenge: challenge,
      code_challenge_method: "S256",
      state: "xyz",
      scope: "read inbox",
      resource: `${BASE}/api/mcp`,
    };
    const page = await authorizeRoute.GET(new Request(`${BASE}/api/oauth/authorize?${form(q)}`));
    expect(page.status).toBe(200);
    expect(await page.text()).toContain("Claude wants to use your Catastif.");
    const noPkce = await authorizeRoute.GET(new Request(`${BASE}/api/oauth/authorize?${form({ ...q, code_challenge_method: "plain" })}`));
    expect(noPkce.status).toBe(400);

    // 3. Consent: wrong password, then right password
    const post = (extra: Record<string, string>) =>
      authorizeRoute.POST(new Request(`${BASE}/api/oauth/authorize`, { method: "POST", body: form({ ...q, ...extra }) }));
    expect((await post({ decision: "allow", level: "inbox", workspace: "work", password: "nope" })).status).toBe(401);
    const ok = await post({ decision: "allow", level: "inbox", workspace: "work", password: PASSWORD });
    expect(ok.status).toBe(303);
    const back = new URL(ok.headers.get("location")!);
    expect(back.origin + back.pathname).toBe("https://claude.ai/api/mcp/auth_callback");
    expect(back.searchParams.get("state")).toBe("xyz");
    expect(back.searchParams.get("iss")).toBe(BASE);
    const code = back.searchParams.get("code")!;

    // 4. Token exchange (PKCE checked, code single-use)
    const exchange = (o: Record<string, string>) =>
      tokenRoute.POST(new Request(`${BASE}/api/oauth/token`, { method: "POST", headers: { "content-type": "application/x-www-form-urlencoded" }, body: form(o) }));
    const base = { grant_type: "authorization_code", code, client_id: client.client_id, redirect_uri: q.redirect_uri };
    const wrong = await exchange({ ...base, code_verifier: "x".repeat(43) });
    expect(wrong.status).toBe(400);
    // The failed attempt burned the code; do the flow again for a fresh one.
    const ok2 = await post({ decision: "allow", level: "inbox", workspace: "work", password: PASSWORD });
    const code2 = new URL(ok2.headers.get("location")!).searchParams.get("code")!;
    const tok = await exchange({ ...base, code: code2, code_verifier: verifier });
    expect(tok.status).toBe(200);
    const tokens = await tok.json();
    expect(tokens).toMatchObject({ token_type: "Bearer", expires_in: 3600, scope: "read inbox" });
    expect((await exchange({ ...base, code: code2, code_verifier: verifier })).status).toBe(400);

    // 5. MCP with the access token: drafts allowed, direct changes not offered, work only
    const init = await mcp(tokens.access_token, "initialize", { protocolVersion: "2025-06-18", capabilities: {}, clientInfo: { name: "test", version: "1" } });
    expect(init.body.result.serverInfo.name).toBe("catastif");
    expect(init.body.result.instructions).toContain("Inbox");
    const list = await mcp(tokens.access_token, "tools/list");
    const names = list.body.result.tools.map((x: { name: string }) => x.name);
    expect(names).toContain("draft_task");
    expect(names).toContain("get_overview");
    expect(names).not.toContain("complete_task");
    const blocked = await call(tokens.access_token, "search_tasks", { workspace: "personal" });
    expect(blocked).toMatchObject({ isError: true });
    expect(blocked.text).toContain("limited to the work workspace");

    // 6. Refresh rotates; replaying an old refresh token disconnects the app
    const r1 = await exchange({ grant_type: "refresh_token", refresh_token: tokens.refresh_token, client_id: client.client_id });
    expect(r1.status).toBe(200);
    const fresh = await r1.json();
    expect(fresh.refresh_token).not.toBe(tokens.refresh_token);
    const replay = await exchange({ grant_type: "refresh_token", refresh_token: tokens.refresh_token, client_id: client.client_id });
    expect(replay.status).toBe(400);
    expect((await mcp(fresh.access_token, "tools/list")).status).toBe(401);
  });

  it("tools: overview, drafts into the Inbox only, direct changes with write", async () => {
    const t = today();
    const acc = await accounts.createAccount({ name: "ING", workspace: "personal", currency: "RON", openingBalance: 100_000 });
    const p = await projects.createProject({ workspace: "work", name: "Villa" });
    const due = await tasks.createTask({ workspace: "personal", title: "Pay rent", dueDate: t });
    const token = (await integrations.createToken({ name: "claude code", scopes: ["read", "inbox", "write"] })).token;

    const overview = await call(token, "get_overview");
    expect(overview.data.today).toBe(t);
    expect(overview.data.tasks_due_today_or_overdue.map((x: { title: string }) => x.title)).toEqual(["Pay rent"]);
    expect(overview.data.safe_to_spend[0].per_currency[0].balance.display).toContain("1,000.00");

    // Drafts: nothing real is created.
    const d1 = await call(token, "draft_task", { workspace: "personal", title: "Order tiles", project_id: p.id, due_date: addDays(t, 3), priority: "high", source_text: "order tiles for the villa" });
    expect(d1.data.status).toBe("pending");
    const d2 = await call(token, "draft_transaction", { account_id: acc.id, title: "Electricity", direction: "out", amount: "230,50", status: "upcoming", date: addDays(t, 5), due_date: addDays(t, 5) });
    expect(d2.data.currency).toBe("RON");
    const bad = await call(token, "draft_transaction", { account_id: acc.id, title: "x", direction: "out", amount: "abc" });
    expect(bad.isError).toBe(true);
    const pending = await inbox.listInbox({ status: ["pending"] });
    expect(pending.map((i) => [i.kind, i.source, (i.draft as { workspace: string }).workspace])).toEqual([
      ["transaction", "chat", "personal"],
      ["task", "chat", "work"], // the project decided the workspace
    ]);
    expect(pending[0].draft).toMatchObject({ amount: 23_050, dueDate: addDays(t, 5) });
    expect((await tasks.listTasks({ q: "tiles" })).length).toBe(0);

    // Direct changes need write.
    const done = await call(token, "complete_task", { task_id: due.id });
    expect(done.data.completed).toBe(true);
    const moved = await call(token, "update_task", { task_id: due.id, due_date: addDays(t, 1), priority: "medium" });
    expect(moved.data).toMatchObject({ due_date: addDays(t, 1), priority: "medium" });

    const detail = await call(token, "get_task", { task_id: due.id });
    expect(detail.data.history.map((h: { event: string }) => h.event)).toContain("completed");

    // A read-only token sees no draft or change tools.
    const reader = (await integrations.createToken({ name: "ro", scopes: ["read"] })).token;
    const names = (await mcp(reader, "tools/list")).body.result.tools.map((x: { name: string }) => x.name);
    expect(names).not.toContain("draft_task");
    expect(names).not.toContain("complete_task");
    expect(names).toContain("get_balance");
    // An inbox-only token (phone capture) can't use MCP at all.
    const phone = (await integrations.createToken({ name: "phone", scopes: ["inbox"] })).token;
    expect((await mcp(phone, "tools/list")).status).toBe(401);
  });
});
