import { and, eq, gte, isNotNull, lte, or, sql } from "drizzle-orm";
import { z } from "zod";
import { db } from "@/server/db/client";
import { accounts, projects, recurringRules, tasks, transactions, type Workspace } from "@/server/db/schema";
import { addDays, daysBetween, today, type ISODate } from "@/lib/dates";
import type { CurrencyCode } from "@/lib/money";
import { invalid } from "./errors";
import { pendingOccurrences } from "./recurring";
import * as s from "./schemas";
import { getTaskRow, updateTask } from "./tasks";
import { getTransaction, isSettled, updateTransaction } from "./transactions";

export type CalendarItem = {
  key: string;
  kind: "task" | "bill" | "income" | "paid" | "received" | "recurring" | "project";
  id: number | null;
  title: string;
  date: ISODate;
  time: string | null;
  workspace: Workspace;
  done: boolean;
  overdue: boolean;
  amount?: number;
  currency?: CurrencyCode;
  direction?: "in" | "out";
  priority?: string;
  color?: string | null;
  /** Can be dragged to another day. */
  movable: boolean;
};

export const calendarInput = z.object({
  from: s.isoDate,
  to: s.isoDate,
  workspace: s.workspace.optional(),
  /** Only this project's tasks and deadline. */
  projectId: s.optionalId,
  showCompleted: z.boolean().default(true),
  showSettled: z.boolean().default(false),
});

export async function calendarItems(input: z.input<typeof calendarInput>): Promise<CalendarItem[]> {
  const f = calendarInput.parse(input);
  if (f.to < f.from) invalid("End is before start");
  if (daysBetween(f.from, f.to) > 400) invalid("Range too long");
  const t = today();
  const wsTask = f.workspace ? eq(tasks.workspace, f.workspace) : undefined;
  const wsTx = f.workspace ? eq(transactions.workspace, f.workspace) : undefined;
  const cashDay = sql<string>`coalesce(${transactions.dueDate}, ${transactions.date})`;

  const onlyProject = !!f.projectId;
  const [taskRows, txRows, projectRows, rules] = await Promise.all([
    db
      .select({ task: tasks, color: projects.color })
      .from(tasks)
      .leftJoin(projects, eq(projects.id, tasks.projectId))
      .where(
        and(
          wsTask,
          f.projectId ? eq(tasks.projectId, f.projectId) : undefined,
          gte(tasks.dueDate, f.from),
          lte(tasks.dueDate, f.to),
          f.showCompleted ? undefined : eq(tasks.completed, false),
        ),
      ),
    db
      .select({ tx: transactions })
      .from(transactions)
      .where(
        and(
          wsTx,
          onlyProject ? sql`false` : undefined,
          sql`${transactions.transferId} is null`,
          or(
            // Open items land on their due date (or cash date).
            and(sql`${transactions.settledAt} is null`, gte(cashDay, f.from), lte(cashDay, f.to)),
            f.showSettled ? and(isNotNull(transactions.settledAt), gte(transactions.date, f.from), lte(transactions.date, f.to)) : undefined,
          ),
        ),
      ),
    db
      .select()
      .from(projects)
      .where(
        and(
          f.workspace ? eq(projects.workspace, f.workspace) : undefined,
          f.projectId ? eq(projects.id, f.projectId) : undefined,
          gte(projects.dueDate, f.from),
          lte(projects.dueDate, f.to),
          sql`${projects.status} <> 'archived'`,
        ),
      ),
    db
      .select({ rule: recurringRules })
      .from(recurringRules)
      .innerJoin(accounts, eq(accounts.id, recurringRules.accountId))
      .where(
        and(
          eq(recurringRules.active, true),
          f.workspace ? eq(recurringRules.workspace, f.workspace) : undefined,
          onlyProject ? sql`false` : undefined,
        ),
      ),
  ]);

  const items: CalendarItem[] = [];
  for (const { task, color } of taskRows) {
    items.push({
      key: `task-${task.id}`,
      kind: "task",
      id: task.id,
      title: task.title,
      date: task.dueDate!,
      time: task.dueTime?.slice(0, 5) ?? null,
      workspace: task.workspace,
      done: task.completed,
      overdue: !task.completed && task.dueDate! < t,
      priority: task.priority,
      color,
      movable: true,
    });
  }
  for (const { tx } of txRows) {
    const settled = isSettled(tx.status);
    const day = settled ? tx.date : (tx.dueDate ?? tx.date);
    items.push({
      key: `tx-${tx.id}`,
      kind: settled ? (tx.direction === "in" ? "received" : "paid") : tx.direction === "in" ? "income" : "bill",
      id: tx.id,
      title: tx.title,
      date: day,
      time: null,
      workspace: tx.workspace,
      done: settled,
      overdue: !settled && day < t,
      amount: tx.amount,
      currency: tx.currency,
      direction: tx.direction,
      movable: !settled,
    });
  }
  for (const p of projectRows) {
    items.push({
      key: `project-${p.id}`,
      kind: "project",
      id: p.id,
      title: p.name,
      date: p.dueDate!,
      time: null,
      workspace: p.workspace,
      done: p.status === "done",
      overdue: p.status !== "done" && p.dueDate! < t,
      color: p.color,
      movable: false,
    });
  }
  for (const { rule } of rules) {
    for (const d of pendingOccurrences(rule, f.to, f.from < t ? t : f.from)) {
      const day = rule.dueOffsetDays != null ? addDays(d, rule.dueOffsetDays) : d;
      if (day < f.from || day > f.to) continue;
      items.push({
        key: `rule-${rule.id}-${d}`,
        kind: "recurring",
        id: rule.id,
        title: rule.title,
        date: day,
        time: null,
        workspace: rule.workspace,
        done: false,
        overdue: false,
        amount: rule.amount,
        currency: rule.currency,
        direction: rule.direction,
        movable: false,
      });
    }
  }
  const order = { project: 0, task: 1, bill: 2, income: 3, recurring: 4, paid: 5, received: 6 };
  return items.sort(
    (a, b) =>
      a.date.localeCompare(b.date) ||
      (a.time ?? "99").localeCompare(b.time ?? "99") ||
      order[a.kind] - order[b.kind] ||
      a.title.localeCompare(b.title),
  );
}

/** Drag on the calendar: tasks change their due date, open money items their due/cash date. */
export async function reschedule(input: { key: string; date: ISODate }) {
  const { key, date } = z.object({ key: z.string(), date: s.isoDate }).parse(input);
  const [kind, rawId] = key.split("-");
  const id = Number(rawId);
  if (!Number.isInteger(id)) invalid("Unknown item");
  if (kind === "task") {
    const task = await getTaskRow(id);
    const startDate = task.startDate && task.startDate > date ? date : undefined;
    return updateTask({ id, dueDate: date, ...(startDate ? { startDate } : {}) });
  }
  if (kind === "tx") {
    const tx = await getTransaction(id);
    if (isSettled(tx.status)) invalid("Settled transactions can't be moved");
    return updateTransaction(tx.dueDate ? { id, dueDate: date, date } : { id, date });
  }
  invalid("This item can't be moved");
}

