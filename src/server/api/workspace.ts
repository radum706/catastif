import { eq } from "drizzle-orm";
import { db } from "@/server/db/client";
import { accounts, categories, payees, projects, tasks, type Workspace } from "@/server/db/schema";
import { invalid, notFound } from "./errors";

export const WORKSPACES = ["personal", "work"] as const satisfies readonly Workspace[];
export type { Workspace };

/** Currency and workspace of an account; both are inherited by everything booked on it. */
export async function accountRef(accountId: number) {
  const [acc] = await db
    .select({ currency: accounts.currency, workspace: accounts.workspace })
    .from(accounts)
    .where(eq(accounts.id, accountId));
  return acc ?? notFound("Account");
}

export async function assertCategoryIn(categoryId: number | null | undefined, workspace: Workspace) {
  if (!categoryId) return;
  const [c] = await db.select({ ws: categories.workspace }).from(categories).where(eq(categories.id, categoryId));
  if (!c) notFound("Category");
  if (c.ws !== workspace) invalid("Category belongs to the other workspace");
}

export async function assertPayeeIn(payeeId: number | null | undefined, workspace: Workspace) {
  if (!payeeId) return;
  const [p] = await db.select({ ws: payees.workspace }).from(payees).where(eq(payees.id, payeeId));
  if (!p) notFound("Payee");
  if (p.ws !== workspace) invalid("Payee belongs to the other workspace");
}

export async function assertAccountIn(accountId: number | null | undefined, workspace: Workspace) {
  if (!accountId) return;
  const acc = await accountRef(accountId);
  if (acc.workspace !== workspace) invalid("Account belongs to the other workspace");
}

export async function assertProjectIn(projectId: number | null | undefined, workspace: Workspace) {
  if (!projectId) return;
  const [p] = await db.select({ ws: projects.workspace }).from(projects).where(eq(projects.id, projectId));
  if (!p) notFound("Project");
  if (p.ws !== workspace) invalid("Project belongs to the other workspace");
}

export async function assertTaskIn(taskId: number | null | undefined, workspace: Workspace) {
  if (!taskId) return;
  const [t] = await db.select({ ws: tasks.workspace }).from(tasks).where(eq(tasks.id, taskId));
  if (!t) notFound("Task");
  if (t.ws !== workspace) invalid("Task belongs to the other workspace");
}
