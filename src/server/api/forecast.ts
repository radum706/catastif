import { and, eq } from "drizzle-orm";
import { z } from "zod";
import { db } from "@/server/db/client";
import { accounts, recurringRules, type Account, type Workspace } from "@/server/db/schema";
import { addDays, daysBetween, today, type ISODate } from "@/lib/dates";
import { signed, type CurrencyCode } from "@/lib/money";
import { pendingOccurrences } from "./recurring";
import { listOpen, settledTotals } from "./transactions";
import * as s from "./schemas";

/** A planned movement: a real open transaction, or a recurring occurrence not yet materialised. */
export type PlannedItem = {
  accountId: number;
  currency: CurrencyCode;
  date: ISODate;
  amount: number; // signed
  title: string;
  direction: "in" | "out";
  isTransfer: boolean;
  virtual: boolean;
  /** Open transaction whose date has already passed. */
  overdue: boolean;
  transactionId?: number;
};

async function plannedUpTo(to: ISODate, workspace?: Workspace): Promise<PlannedItem[]> {
  const t = today();
  const [open, rules] = await Promise.all([
    listOpen({ to, workspace }),
    db
      .select()
      .from(recurringRules)
      .where(
        and(
          eq(recurringRules.active, true),
          workspace ? eq(recurringRules.workspace, workspace) : undefined,
        ),
      ),
  ]);
  const items: PlannedItem[] = open.map(({ tx }) => ({
    accountId: tx.accountId,
    currency: tx.currency,
    // Overdue items are still expected; they land "today".
    date: tx.date < t ? t : tx.date,
    amount: signed(tx.amount, tx.direction),
    title: tx.title,
    direction: tx.direction,
    isTransfer: tx.transferId !== null,
    virtual: false,
    overdue: tx.date < t,
    transactionId: tx.id,
  }));
  for (const rule of rules) {
    for (const d of pendingOccurrences(rule, to, t)) {
      items.push({
        accountId: rule.accountId,
        currency: rule.currency,
        date: d,
        amount: signed(rule.amount, rule.direction),
        title: rule.title,
        direction: rule.direction,
        isTransfer: false,
        virtual: true,
        overdue: false,
      });
    }
  }
  return items.sort((a, b) => (a.date < b.date ? -1 : a.date > b.date ? 1 : 0));
}

export type AccountBalance = {
  account: Account;
  current: number;
  atDate: number;
};

export type CurrencyTotal = { currency: CurrencyCode; current: number; atDate: number };

export const balanceAtInput = z.object({
  date: s.isoDate,
  workspace: s.workspace.optional(),
  includeArchived: z.boolean().default(false),
});

/**
 * Balance per account at `date`:
 *   opening balance + settled transactions up to the date
 *   + (for today or later) every open transaction and recurring occurrence up to the date.
 * Totals are per currency; no FX conversion.
 */
export async function balanceAt(input: z.input<typeof balanceAtInput>) {
  const { date, includeArchived, workspace } = balanceAtInput.parse(input);
  const t = today();
  const accRows = (
    await db.select().from(accounts).where(workspace ? eq(accounts.workspace, workspace) : undefined)
  ).filter((a) => includeArchived || !a.archived);
  const [settledNow, settledAtDate, planned] = await Promise.all([
    settledTotals(),
    date < t ? settledTotals(date) : Promise.resolve(null),
    date >= t ? plannedUpTo(date, workspace) : Promise.resolve([] as PlannedItem[]),
  ]);

  const plannedByAccount = new Map<number, number>();
  for (const p of planned) plannedByAccount.set(p.accountId, (plannedByAccount.get(p.accountId) ?? 0) + p.amount);

  const perAccount: AccountBalance[] = accRows.map((account) => {
    const current = account.openingBalance + (settledNow.get(account.id) ?? 0);
    const atDate =
      date < t
        ? account.openingBalance + (settledAtDate?.get(account.id) ?? 0)
        : current + (plannedByAccount.get(account.id) ?? 0);
    return { account, current, atDate };
  });

  const totals = new Map<CurrencyCode, CurrencyTotal>();
  for (const b of perAccount) {
    const cur = totals.get(b.account.currency) ?? { currency: b.account.currency, current: 0, atDate: 0 };
    cur.current += b.current;
    cur.atDate += b.atDate;
    totals.set(b.account.currency, cur);
  }

  return { date, perAccount, totals: [...totals.values()], planned };
}

/** Daily total per currency from today to `to`, plus the lowest point. For the chart. */
export async function forecastSeries(input: { to: ISODate; workspace?: Workspace }) {
  const { to, workspace } = z.object({ to: s.isoDate, workspace: s.workspace.optional() }).parse(input);
  const t = today();
  const end = to < t ? t : to;
  const { perAccount, planned } = await balanceAt({ date: end, workspace });

  const series = new Map<CurrencyCode, { date: ISODate; balance: number }[]>();
  const running = new Map<CurrencyCode, number>();
  for (const b of perAccount) {
    running.set(b.account.currency, (running.get(b.account.currency) ?? 0) + b.current);
  }
  const accountCurrency = new Map(perAccount.map((b) => [b.account.id, b.account.currency]));
  const byDate = new Map<ISODate, PlannedItem[]>();
  for (const p of planned) {
    if (!accountCurrency.has(p.accountId)) continue; // archived account
    byDate.set(p.date, [...(byDate.get(p.date) ?? []), p]);
  }

  const days = daysBetween(t, end);
  for (let i = 0; i <= days; i++) {
    const d = addDays(t, i);
    for (const p of byDate.get(d) ?? []) running.set(p.currency, (running.get(p.currency) ?? 0) + p.amount);
    for (const [cur, bal] of running) {
      const arr = series.get(cur) ?? [];
      arr.push({ date: d, balance: bal });
      series.set(cur, arr);
    }
  }

  return [...series.entries()].map(([currency, points]) => {
    const low = points.reduce((m, p) => (p.balance < m.balance ? p : m), points[0]);
    return { currency, points, low };
  });
}

export type SafeToSpend = {
  currency: CurrencyCode;
  current: number;
  billsBeforeIncome: number;
  nextIncome: { date: ISODate; title: string; amount: number } | null;
  until: ISODate;
  safe: number;
};

/**
 * Current balance minus every bill due before the next expected income (per currency).
 * Transfers between your own accounts are ignored. Without upcoming income, looks 30 days ahead.
 */
export async function safeToSpend(workspace?: Workspace): Promise<SafeToSpend[]> {
  const t = today();
  const horizon = addDays(t, 62);
  const { totals, planned } = await balanceAt({ date: horizon, workspace });
  return totals.map(({ currency, current }) => {
    const items = planned.filter((p) => p.currency === currency && !p.isTransfer);
    const income = items.find((p) => p.direction === "in" && !p.overdue);
    const until = income ? income.date : addDays(t, 30);
    const bills = items
      .filter((p) => p.direction === "out" && p.date <= until)
      .reduce((sum, p) => sum - p.amount, 0);
    return {
      currency,
      current,
      billsBeforeIncome: bills,
      nextIncome: income ? { date: income.date, title: income.title, amount: income.amount } : null,
      until,
      safe: current - bills,
    };
  });
}
