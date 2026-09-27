import { and, desc, eq, inArray } from "drizzle-orm";
import { z } from "zod";
import { db } from "@/server/db/client";
import { inboxItems, type Workspace } from "@/server/db/schema";
import { appTimeZone, today } from "@/lib/dates";
import { extract, type ExtractContext } from "@/server/llm";
import { taskDraft, transactionDraft } from "@/server/llm/types";
import { listAccounts } from "./accounts";
import { listCategories } from "./categories";
import { invalid, notFound } from "./errors";
import { emit } from "./events";
import { listPayees } from "./payees";
import { listProjects } from "./projects";
import * as s from "./schemas";
import { createTask } from "./tasks";
import { createTransaction } from "./transactions";
import { WORKSPACES } from "./workspace";

export const inboxSource = z.enum(["manual", "phone", "email", "n8n", "api", "chat"]);

export const captureInput = z.object({
  text: z.string().trim().min(1).max(5000),
  source: inboxSource.default("manual"),
  workspace: s.workspace.nullish(),
  kind: z.enum(["task", "transaction"]).optional(),
});

async function workspaceContext(ws: Workspace) {
  const [accounts, categories, payees, projects] = await Promise.all([
    listAccounts({ workspace: ws }),
    listCategories({ workspace: ws }),
    listPayees({ workspace: ws }),
    listProjects({ workspace: ws }),
  ]);
  return {
    accounts: accounts.map((a) => ({ id: a.id, name: a.name, currency: a.currency })),
    categories: categories.map((c) => ({ id: c.id, name: c.name, kind: c.kind })),
    payees: payees.map((p) => ({ id: p.id, name: p.name, defaultDirection: p.defaultDirection, defaultCategoryId: p.defaultCategoryId, defaultAccountId: p.defaultAccountId })),
    projects: projects.map((p) => ({ id: p.project.id, name: p.project.name })),
  };
}

export async function buildContext(workspaceHint: Workspace | null, kind?: "task" | "transaction"): Promise<ExtractContext> {
  const [personal, work] = await Promise.all(WORKSPACES.map(workspaceContext));
  return { today: today(), timeZone: appTimeZone(), workspaceHint, kind, workspaces: { personal, work } };
}

async function runExtraction(itemId: number, text: string, hint: Workspace | null, kind?: "task" | "transaction") {
  const { result, extractor, error } = await extract(text, await buildContext(hint, kind));
  const [row] = await db
    .update(inboxItems)
    .set({ kind: result.kind, draft: result.draft, extractor, error })
    .where(eq(inboxItems.id, itemId))
    .returning();
  return row;
}

/** Capture free text (phone, n8n, email, the Inbox box). AI drafts it; nothing real is created yet. */
export async function capture(input: z.input<typeof captureInput>) {
  const data = captureInput.parse(input);
  const [item] = await db
    .insert(inboxItems)
    .values({ source: data.source, workspace: data.workspace ?? null, rawText: data.text })
    .returning();
  let row = item;
  try {
    row = await runExtraction(item.id, data.text, data.workspace ?? null, data.kind);
  } catch (err) {
    [row] = await db
      .update(inboxItems)
      .set({ error: err instanceof Error ? err.message : String(err) })
      .where(eq(inboxItems.id, item.id))
      .returning();
  }
  await emit("inbox.created", row.workspace, { item: row });
  return row;
}

export async function getInboxItem(itemId: number) {
  const [row] = await db.select().from(inboxItems).where(eq(inboxItems.id, itemId));
  return row ?? notFound("Inbox item");
}

export async function listInbox(opts: { status?: ("pending" | "approved" | "rejected")[]; limit?: number } = {}) {
  return db
    .select()
    .from(inboxItems)
    .where(opts.status?.length ? inArray(inboxItems.status, opts.status) : undefined)
    .orderBy(desc(inboxItems.createdAt), desc(inboxItems.id))
    .limit(opts.limit ?? 100);
}

export async function pendingCount() {
  return (await db.select({ id: inboxItems.id }).from(inboxItems).where(eq(inboxItems.status, "pending"))).length;
}

async function pending(itemId: number) {
  const item = await getInboxItem(itemId);
  if (item.status !== "pending") invalid("This item was already handled");
  return item;
}

/** Re-draft, optionally as a specific kind ("make this a task"). */
export async function redraft(input: { id: number; kind?: "task" | "transaction" }) {
  const item = await pending(input.id);
  return runExtraction(item.id, item.rawText, item.workspace, input.kind);
}

/** Save your edits to the draft without approving it. */
export async function updateDraft(input: { id: number; kind: "task" | "transaction"; draft: unknown }) {
  const item = await pending(input.id);
  const draft = input.kind === "task" ? taskDraft.parse(input.draft) : transactionDraft.parse(input.draft);
  const [row] = await db.update(inboxItems).set({ kind: input.kind, draft }).where(eq(inboxItems.id, item.id)).returning();
  return row;
}

/**
 * The one-tap step that turns a draft into a real task or transaction.
 * An edited draft can be passed in; otherwise the stored one is used.
 */
export async function approve(input: { id: number; kind?: "task" | "transaction"; draft?: unknown }) {
  const item = await pending(input.id);
  const kind = input.kind ?? item.kind;
  const raw = input.draft ?? item.draft;
  let resultType: "task" | "transaction";
  let resultId: number;
  if (kind === "task") {
    const d = taskDraft.parse(raw);
    const task = await createTask({
      workspace: d.projectId ? undefined : d.workspace,
      projectId: d.projectId,
      title: d.title,
      notes: d.notes,
      dueDate: d.dueDate,
      dueTime: d.dueTime,
      priority: d.priority,
      tags: d.tags,
    });
    resultType = "task";
    resultId = task.id;
  } else if (kind === "transaction") {
    const d = transactionDraft.parse(raw);
    if (!d.amount) invalid("Add an amount before approving");
    if (!d.accountId) invalid("Pick an account before approving");
    const tx = await createTransaction({
      title: d.title,
      direction: d.direction,
      amount: d.amount,
      accountId: d.accountId,
      status: d.status,
      date: d.date,
      dueDate: d.dueDate,
      categoryId: d.categoryId,
      payeeId: d.payeeId,
      notes: d.notes,
    });
    resultType = "transaction";
    resultId = tx.id;
  } else {
    invalid("Choose task or transaction first");
  }
  const [row] = await db
    .update(inboxItems)
    .set({ status: "approved", kind, draft: raw as Record<string, unknown>, resultType, resultId, resolvedAt: new Date() })
    .where(and(eq(inboxItems.id, item.id), eq(inboxItems.status, "pending")))
    .returning();
  await emit("inbox.approved", row.workspace, { item: row });
  return row;
}

export async function reject(itemId: number) {
  const item = await pending(itemId);
  const [row] = await db
    .update(inboxItems)
    .set({ status: "rejected", resolvedAt: new Date() })
    .where(eq(inboxItems.id, item.id))
    .returning();
  return row;
}

export async function deleteInboxItem(itemId: number) {
  await db.delete(inboxItems).where(eq(inboxItems.id, itemId));
}
