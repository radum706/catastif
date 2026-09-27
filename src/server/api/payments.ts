import { and, gte, inArray, isNull, lte, sql } from "drizzle-orm";
import { db } from "@/server/db/client";
import { transactions } from "@/server/db/schema";
import { addDays, daysBetween, endOfMonth, startOfMonth, today } from "@/lib/dates";
import type { CurrencyCode } from "@/lib/money";
import { listOpen, listTransactions, type TransactionRow } from "./transactions";

export type BillRow = TransactionRow & { due: string; daysLeft: number };

/** Money out you still owe, grouped by urgency, plus what you paid this month. */
export async function bills(opts: { soonDays?: number } = {}) {
  const t = today();
  const soon = addDays(t, opts.soonDays ?? 7);
  const open = await listOpen({ direction: "out", excludeTransfers: true });
  const rows: BillRow[] = open.map((r) => {
    const due = r.tx.dueDate ?? r.tx.date;
    return { ...r, due, daysLeft: daysBetween(t, due) };
  });
  const paidThisMonth = await listTransactions({
    direction: "out",
    status: ["paid"],
    from: startOfMonth(t),
    to: endOfMonth(t),
    includeTransfers: false,
  });
  return {
    overdue: rows.filter((r) => r.due < t),
    dueSoon: rows.filter((r) => r.due >= t && r.due <= soon),
    later: rows.filter((r) => r.due > soon),
    paidThisMonth,
  };
}

export type CollectRow = TransactionRow & { waitingDays: number; late: boolean };

/** Money in you're waiting for: invoiced (with age) and expected. */
export async function toCollect() {
  const t = today();
  const open = await listOpen({ direction: "in", excludeTransfers: true });
  const rows: CollectRow[] = open.map((r) => ({
    ...r,
    waitingDays: r.tx.invoicedAt ? daysBetween(r.tx.invoicedAt, t) : Math.max(0, daysBetween(r.tx.date, t)),
    late: r.tx.date < t,
  }));
  const receivedThisMonth = await listTransactions({
    direction: "in",
    status: ["received"],
    from: startOfMonth(t),
    to: endOfMonth(t),
    includeTransfers: false,
  });
  return {
    invoiced: rows.filter((r) => r.tx.status === "invoiced"),
    expected: rows.filter((r) => r.tx.status === "upcoming"),
    receivedThisMonth,
  };
}

export type MonthSummary = {
  currency: CurrencyCode;
  inSettled: number;
  outSettled: number;
  inPlanned: number;
  outPlanned: number;
};

/** In/out for a month per currency, excluding transfers between your own accounts. */
export async function monthSummary(month: string = today()) {
  const from = startOfMonth(month);
  const to = endOfMonth(month);
  const rows = await db
    .select({
      currency: transactions.currency,
      direction: transactions.direction,
      settled: sql<boolean>`${transactions.settledAt} is not null`,
      total: sql<string>`sum(${transactions.amount})`,
    })
    .from(transactions)
    .where(and(gte(transactions.date, from), lte(transactions.date, to), isNull(transactions.transferId)))
    .groupBy(transactions.currency, transactions.direction, sql`${transactions.settledAt} is not null`);

  const map = new Map<CurrencyCode, MonthSummary>();
  for (const r of rows) {
    const m = map.get(r.currency) ?? { currency: r.currency, inSettled: 0, outSettled: 0, inPlanned: 0, outPlanned: 0 };
    const v = Number(r.total);
    if (r.direction === "in") r.settled ? (m.inSettled += v) : (m.inPlanned += v);
    else r.settled ? (m.outSettled += v) : (m.outPlanned += v);
    map.set(r.currency, m);
  }
  return { from, to, summary: [...map.values()] };
}

/** Settled spending by category for a month (sub-categories roll up to their parent). */
export async function spendingByCategory(month: string = today()) {
  const rows = await listTransactions({
    from: startOfMonth(month),
    to: endOfMonth(month),
    direction: "out",
    status: ["paid"],
    includeTransfers: false,
    limit: 1000,
  });
  const map = new Map<string, { currency: CurrencyCode; category: string; total: number }>();
  for (const r of rows) {
    const category = r.parentCategoryName ?? r.categoryName ?? "Uncategorised";
    const key = `${r.tx.currency}:${category}`;
    const cur = map.get(key) ?? { currency: r.tx.currency, category, total: 0 };
    cur.total += r.tx.amount;
    map.set(key, cur);
  }
  return [...map.values()].sort((a, b) => b.total - a.total);
}

export async function openCounts() {
  const t = today();
  const rows = await db
    .select({ direction: transactions.direction, date: sql<string>`coalesce(${transactions.dueDate}, ${transactions.date})` })
    .from(transactions)
    .where(and(inArray(transactions.status, ["upcoming", "invoiced"]), isNull(transactions.transferId)));
  return {
    overdueBills: rows.filter((r) => r.direction === "out" && r.date < t).length,
    lateIncome: rows.filter((r) => r.direction === "in" && r.date < t).length,
  };
}

