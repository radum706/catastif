// Compact, model-friendly shapes for tool results. Money keeps minor units and a display string.
import { formatMoney, type CurrencyCode } from "@/lib/money";
import type { TaskRow } from "@/server/api/tasks";
import type { TransactionRow } from "@/server/api/transactions";
import type { Transaction } from "@/server/db/schema";

export const money = (amount: number, currency: CurrencyCode) => ({ minor: amount, display: formatMoney(amount, currency) });

export function task(r: TaskRow) {
  const t = r.task;
  return {
    id: t.id,
    title: t.title,
    workspace: t.workspace,
    completed: t.completed,
    due_date: t.dueDate,
    due_time: t.dueTime?.slice(0, 5) ?? null,
    start_date: t.startDate,
    priority: t.priority,
    project: t.projectId ? { id: t.projectId, name: r.projectName, section: r.sectionName } : null,
    parent: t.parentId ? { id: t.parentId, title: r.parentTitle } : null,
    tags: r.tags.map((x) => x.name),
    subtasks: r.subtasks ? `${r.subtasksDone}/${r.subtasks}` : undefined,
    has_notes: !!t.notes || undefined,
  };
}

export function tx(t: Transaction, names?: Partial<Omit<TransactionRow, "tx">>) {
  return {
    id: t.id,
    title: t.title,
    workspace: t.workspace,
    direction: t.direction,
    amount: money(t.amount, t.currency),
    status: t.status,
    date: t.date,
    due_date: t.dueDate ?? undefined,
    invoiced_at: t.invoicedAt ?? undefined,
    account: names?.accountName ? { id: t.accountId, name: names.accountName } : { id: t.accountId },
    category: names?.categoryName ?? undefined,
    payee: names?.payeeName ?? undefined,
    project_id: t.projectId ?? undefined,
    task_id: t.taskId ?? undefined,
    transfer: t.transferId ? true : undefined,
    recurring: t.recurringRuleId ? true : undefined,
  };
}

export const txRow = (r: TransactionRow) => tx(r.tx, r);
