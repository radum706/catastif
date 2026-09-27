import { createHmac } from "node:crypto";
import { afterAll, beforeEach, describe, expect, it } from "vitest";
import { hasDb, resetDb } from "./db";
import { closeDb } from "@/server/db/client";
import { accounts, integrations, projects, tasks, transactions } from "@/server/api";
import { overdueDigest } from "@/server/api/digest";
import { addDays, today } from "@/lib/dates";
import * as tasksRoute from "@/app/api/v1/tasks/route";
import * as txRoute from "@/app/api/v1/transactions/route";
import * as icalRoute from "@/app/api/v1/ical/route";
import * as completeRoute from "@/app/api/v1/tasks/[id]/complete/route";

const noParams = { params: Promise.resolve({}) };
const req = (path: string, init: RequestInit & { token?: string } = {}) =>
  new Request(`http://catastif.test${path}`, {
    ...init,
    headers: { ...(init.token ? { authorization: `Bearer ${init.token}` } : {}), "content-type": "application/json", ...(init.headers ?? {}) },
  });

describe.skipIf(!hasDb)("integrations (integration)", () => {
  beforeEach(resetDb);
  afterAll(closeDb);

  it("issues, verifies and revokes tokens; checks scopes", async () => {
    const { token, row } = await integrations.createToken({ name: "n8n", scopes: ["read"] });
    expect(token).toMatch(/^cat_/);
    expect(row.tokenHash).not.toContain(token);
    const found = await integrations.verifyToken(token);
    expect(found?.id).toBe(row.id);
    expect(integrations.hasScope(found!, "write")).toBe(false);
    await integrations.revokeToken(row.id);
    expect(await integrations.verifyToken(token)).toBeNull();
    expect(await integrations.verifyToken("cat_nope")).toBeNull();
  });

  it("REST: auth, create task from a line, workspace-limited tokens", async () => {
    const unauth = await tasksRoute.GET(req("/api/v1/tasks"), noParams);
    expect(unauth.status).toBe(401);

    const reader = (await integrations.createToken({ name: "r", scopes: ["read"] })).token;
    const denied = await tasksRoute.POST(req("/api/v1/tasks", { method: "POST", token: reader, body: JSON.stringify({ text: "x" }) }), noParams);
    expect(denied.status).toBe(403);

    const writer = (await integrations.createToken({ name: "w", scopes: ["write"], workspace: "work" })).token;
    const res = await tasksRoute.POST(
      req("/api/v1/tasks", { method: "POST", token: writer, body: JSON.stringify({ text: "call accountant tomorrow 14:00 !high #admin" }) }),
      noParams,
    );
    expect(res.status).toBe(201);
    const { task } = await res.json();
    expect(task).toMatchObject({ title: "Call accountant", workspace: "work", dueDate: addDays(today(), 1), dueTime: "14:00:00", priority: "high" });

    // A work-only token can't write personal things or read them.
    const blocked = await tasksRoute.POST(
      req("/api/v1/tasks", { method: "POST", token: writer, body: JSON.stringify({ title: "x", workspace: "personal" }) }),
      noParams,
    );
    expect(blocked.status).toBe(403);
    const personalProject = await projects.createProject({ workspace: "personal", name: "Home" });
    const blocked2 = await tasksRoute.POST(
      req("/api/v1/tasks", { method: "POST", token: writer, body: JSON.stringify({ title: "x", projectId: personalProject.id }) }),
      noParams,
    );
    expect(blocked2.status).toBe(403);
    expect((await tasksRoute.GET(req("/api/v1/tasks?workspace=personal", { token: writer }), noParams)).status).toBe(403);
    const list = await (await tasksRoute.GET(req("/api/v1/tasks", { token: writer }), noParams)).json();
    expect(list.tasks.map((x: { title: string }) => x.title)).toEqual(["Call accountant"]);

    // Complete it.
    const done = await completeRoute.POST(req(`/api/v1/tasks/${task.id}/complete`, { method: "POST", token: writer }), {
      params: Promise.resolve({ id: String(task.id) }),
    });
    expect((await done.json()).task.completed).toBe(true);

    // Validation errors come back as 400 with details.
    const bad = await tasksRoute.POST(req("/api/v1/tasks", { method: "POST", token: writer, body: JSON.stringify({ workspace: "work" }) }), noParams);
    expect(bad.status).toBe(400);
  });

  it("REST: transactions with quick-add text", async () => {
    const acc = await accounts.createAccount({ name: "ING", workspace: "personal", currency: "RON" });
    const token = (await integrations.createToken({ name: "phone", scopes: ["write"] })).token;
    const res = await txRoute.POST(
      req("/api/v1/transactions", { method: "POST", token, body: JSON.stringify({ text: "-45,90 Lidl", workspace: "personal", accountId: acc.id }) }),
      noParams,
    );
    expect(res.status).toBe(201);
    expect((await res.json()).transaction).toMatchObject({ amount: 4590, direction: "out", status: "paid" });
  });

  it("webhooks: outbox, HMAC signature, retries with backoff", async () => {
    const hook = await integrations.createWebhook({ name: "n8n", url: "http://n8n.local/webhook/abc", events: ["task.created", "task.completed"], workspace: "work" });
    await integrations.createWebhook({ name: "off", url: "http://x.local/", events: ["*"] }).then((h) => integrations.updateWebhook({ id: h.id, active: false }));

    await tasks.createTask({ workspace: "personal", title: "not for this hook" });
    const t = await tasks.createTask({ workspace: "work", title: "Quote for Popescu" });
    await tasks.updateTask({ id: t.id, notes: "x" }); // task.updated: not subscribed
    let rows = await integrations.listDeliveries();
    expect(rows.map((r) => r.event)).toEqual(["task.created"]);

    const calls: { url: string; headers: Headers; body: string }[] = [];
    const ok: typeof fetch = async (url, init) => {
      calls.push({ url: String(url), headers: new Headers(init?.headers), body: String(init?.body) });
      return new Response("ok");
    };
    expect(await integrations.deliverDue({ fetchImpl: ok })).toEqual({ attempted: 1, delivered: 1, failed: 0 });
    const call = calls[0];
    const ts = call.headers.get("x-catastif-timestamp")!;
    const expected = `sha256=${createHmac("sha256", hook.secret).update(`${ts}.${call.body}`).digest("hex")}`;
    expect(call.headers.get("x-catastif-signature")).toBe(expected);
    expect(call.headers.get("x-catastif-event")).toBe("task.created");
    expect(JSON.parse(call.body)).toMatchObject({ event: "task.created", workspace: "work", data: { task: { title: "Quote for Popescu" } } });

    // Failing receiver: retried with backoff, then marked failed.
    await tasks.setCompleted({ id: t.id, completed: true });
    const down: typeof fetch = async () => new Response("nope", { status: 502 });
    let now = new Date();
    for (let i = 0; i < 6; i++) {
      await integrations.deliverDue({ fetchImpl: down, now });
      now = new Date(now.getTime() + 13 * 3600_000);
    }
    rows = await integrations.listDeliveries();
    const failed = rows.find((r) => r.event === "task.completed")!;
    expect(failed).toMatchObject({ status: "failed", attempts: 6, responseStatus: 502 });
    expect((await integrations.getWebhook(hook.id)).lastError).toBe("HTTP 502");

    await integrations.retryDelivery(failed.id);
    expect((await integrations.deliverDue({ fetchImpl: ok })).delivered).toBe(1);
  });

  it("daily digest lists overdue bills and tasks per workspace", async () => {
    await integrations.createWebhook({ name: "all", url: "http://n8n.local/x", events: ["bill.overdue", "task.overdue"] });
    const acc = await accounts.createAccount({ name: "ING", workspace: "personal", currency: "RON" });
    await transactions.createTransaction({ title: "Enel", direction: "out", amount: 23_000, accountId: acc.id, status: "upcoming", date: addDays(today(), -3) });
    await tasks.createTask({ workspace: "work", title: "Late thing", dueDate: addDays(today(), -1) });
    expect(await overdueDigest()).toEqual(["personal:bills=1", "work:tasks=1"]);
    const rows = await integrations.listDeliveries();
    const bill = rows.find((r) => r.event === "bill.overdue")!;
    expect(bill.payload).toMatchObject({ workspace: "personal", data: { items: [{ title: "Enel", daysLate: 3 }] } });
  });

  it("iCal feed accepts ?token= with the calendar scope", async () => {
    const token = (await integrations.createToken({ name: "phone cal", scopes: ["calendar"] })).token;
    await tasks.createTask({ workspace: "personal", title: "Dentist, check-up", dueDate: addDays(today(), 1), dueTime: "09:30", estimateMinutes: 60 });
    const res = await icalRoute.GET(new Request(`http://catastif.test/api/v1/ical?token=${token}`), noParams);
    expect(res.status).toBe(200);
    expect(res.headers.get("content-type")).toContain("text/calendar");
    const text = await res.text();
    expect(text).toContain("BEGIN:VCALENDAR");
    expect(text).toContain("SUMMARY:Dentist\\, check-up");
    expect(text).toMatch(/DTSTART;TZID=Europe\/Bucharest:\d{8}T093000/);
    expect(text).toMatch(/DTEND;TZID=Europe\/Bucharest:\d{8}T103000/);
    const other = (await integrations.createToken({ name: "read", scopes: ["read"] })).token;
    expect((await icalRoute.GET(new Request(`http://catastif.test/api/v1/ical?token=${other}`), noParams)).status).toBe(403);
  });
});
