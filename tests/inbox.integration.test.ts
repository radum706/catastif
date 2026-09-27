import { afterAll, afterEach, beforeEach, describe, expect, it } from "vitest";
import { hasDb, resetDb } from "./db";
import { closeDb } from "@/server/db/client";
import { accounts, categories, inbox, integrations, projects, tasks, transactions } from "@/server/api";
import { setProvider, type ExtractContext, type LlmProvider } from "@/server/llm";
import { ParserProvider } from "@/server/llm/parser-provider";
import { redact } from "@/server/llm/redact";
import { addDays, today } from "@/lib/dates";
import * as inboxRoute from "@/app/api/v1/inbox/route";

describe("redact", () => {
  it("removes bank, card, id, email and phone numbers", () => {
    const out = redact(
      "Pay RO49AAAA1B31007593840000 from card 4111 1111 1111 1111, CNP 1800101221144, mail ion@ex.ro, call +40 745 123 456 — 230 lei by 15.10",
    );
    expect(out).toBe("Pay [IBAN] from card [NUMBER], CNP [ID], mail [EMAIL], call [PHONE] — 230 lei by 15.10");
  });
});

/** Stands in for the model: records what it was sent and returns a fixed draft. */
class FakeProvider implements LlmProvider {
  readonly name = "fake";
  seen: { text: string; ctx: ExtractContext }[] = [];
  constructor(private reply: (ctx: ExtractContext) => Awaited<ReturnType<LlmProvider["extract"]>>) {}
  async extract(text: string, ctx: ExtractContext) {
    this.seen.push({ text, ctx });
    return this.reply(ctx);
  }
}

describe.skipIf(!hasDb)("inbox (integration)", () => {
  beforeEach(resetDb);
  afterEach(() => setProvider(null));
  afterAll(closeDb);

  it("drafts with the model, then creates the task only on approval", async () => {
    const p = await projects.createProject({ workspace: "work", name: "Villa" });
    const fake = new FakeProvider((ctx) => ({
      kind: "task",
      draft: { workspace: "work", title: "Order tiles", notes: null, dueDate: addDays(ctx.today, 2), dueTime: null, priority: "high", projectId: p.id, tags: ["site"] },
    }));
    setProvider(fake);
    const item = await inbox.capture({ text: "order tiles for the villa by tuesday, urgent", source: "phone" });
    expect(item).toMatchObject({ status: "pending", kind: "task", extractor: "fake", error: null });
    expect(fake.seen[0].ctx.workspaces.work.projects).toEqual([{ id: p.id, name: "Villa" }]);
    expect(await tasks.listTasks()).toHaveLength(0); // nothing real yet

    const done = await inbox.approve({ id: item.id });
    expect(done).toMatchObject({ status: "approved", resultType: "task" });
    const [task] = await tasks.listTasks();
    expect(task.task).toMatchObject({ id: done.resultId, title: "Order tiles", projectId: p.id, workspace: "work", priority: "high" });
    await expect(inbox.approve({ id: item.id })).rejects.toThrow(/already handled/);
  });

  it("falls back to the local parser when the model fails, and you can edit before approving", async () => {
    const acc = await accounts.createAccount({ name: "ING", workspace: "personal", currency: "RON" });
    await categories.seedDefaultCategories("personal");
    setProvider(new FakeProvider(() => { throw new Error("overloaded"); }));
    const item = await inbox.capture({ text: "-230 electricity unpaid @15", workspace: "personal" });
    expect(item).toMatchObject({ kind: "transaction", extractor: "parser", error: "fake: overloaded" });
    expect(item.draft).toMatchObject({ direction: "out", amount: 23_000, accountId: acc.id, status: "upcoming" });

    // Missing amount blocks approval; editing fixes it.
    await expect(inbox.approve({ id: item.id, draft: { ...item.draft, amount: null } })).rejects.toThrow(/amount/);
    await inbox.updateDraft({ id: item.id, kind: "transaction", draft: { ...item.draft, title: "Enel September", amount: 24_550 } });
    const approved = await inbox.approve({ id: item.id });
    const tx = await transactions.getTransaction(approved.resultId!);
    expect(tx).toMatchObject({ title: "Enel September", amount: 24_550, status: "upcoming", workspace: "personal" });
  });

  it("re-drafts as another kind, and rejects", async () => {
    setProvider(new ParserProvider());
    const item = await inbox.capture({ text: "call the accountant tomorrow", workspace: "work" });
    expect(item).toMatchObject({ kind: "task", draft: { title: "Call the accountant", dueDate: addDays(today(), 1), workspace: "work" } });
    const again = await inbox.redraft({ id: item.id, kind: "transaction" });
    expect(again.kind).toBe("transaction");
    const rejected = await inbox.reject(item.id);
    expect(rejected.status).toBe("rejected");
    expect(await inbox.pendingCount()).toBe(0);
  });

  it("POST /api/v1/inbox works with an inbox-only token", async () => {
    setProvider(new ParserProvider());
    const token = (await integrations.createToken({ name: "phone", scopes: ["inbox"] })).token;
    const res = await inboxRoute.POST(
      new Request("http://catastif.test/api/v1/inbox", {
        method: "POST",
        headers: { authorization: `Bearer ${token}`, "content-type": "application/json" },
        body: JSON.stringify({ text: "buy printer ink", source: "phone", workspace: "work" }),
      }),
      { params: Promise.resolve({}) },
    );
    expect(res.status).toBe(201);
    expect((await res.json()).item).toMatchObject({ source: "phone", kind: "task", status: "pending" });
    // The same token can't create real things directly.
    const tasksRoute = await import("@/app/api/v1/tasks/route");
    const denied = await tasksRoute.POST(
      new Request("http://catastif.test/api/v1/tasks", { method: "POST", headers: { authorization: `Bearer ${token}` }, body: "{}" }),
      { params: Promise.resolve({}) },
    );
    expect(denied.status).toBe(403);
  });
});
