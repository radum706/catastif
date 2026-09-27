import { and, asc, eq, gte } from "drizzle-orm";
import { z } from "zod";
import { db } from "@/server/db/client";
import { accounts, recurringRules, transactions, type RecurringRule } from "@/server/db/schema";
import { addDays, addMonths, maxDate, today, type ISODate } from "@/lib/dates";
import { occurrencesBetween } from "@/lib/recurrence";
import { notFound } from "./errors";
import * as s from "./schemas";

export const createRuleInput = z.object({
  title: s.name,
  direction: s.direction,
  amount: s.amount,
  accountId: s.id,
  categoryId: s.optionalId,
  payeeId: s.optionalId,
  context: s.context.default("personal"),
  frequency: s.frequency.default("monthly"),
  interval: z.number().int().min(1).max(366).default(1),
  startDate: s.isoDate,
  endDate: s.isoDate.nullish(),
  dueOffsetDays: z.number().int().min(0).max(365).nullish(),
  active: z.boolean().default(true),
  notes: s.notes,
});

export const updateRuleInput = createRuleInput.partial().extend({ id: s.id });

export function horizonMonths(): number {
  const n = Number(process.env.RECURRING_HORIZON_MONTHS ?? 12);
  return Number.isFinite(n) && n > 0 ? Math.min(n, 60) : 12;
}

export function defaultHorizon(): ISODate {
  return addMonths(today(), horizonMonths());
}

/** Occurrences a rule would produce in [from, to] that are not yet materialised. */
export function pendingOccurrences(rule: RecurringRule, to: ISODate, from: ISODate = today()): ISODate[] {
  if (!rule.active) return [];
  let start = maxDate(rule.startDate, from);
  if (rule.generatedUntil) start = maxDate(start, addDays(rule.generatedUntil, 1));
  if (start > to) return [];
  return occurrencesBetween(rule, start, to);
}

export async function listRules() {
  return db
    .select({ rule: recurringRules, accountName: accounts.name })
    .from(recurringRules)
    .innerJoin(accounts, eq(accounts.id, recurringRules.accountId))
    .orderBy(asc(recurringRules.active), asc(recurringRules.title));
}

export async function getRule(ruleId: number) {
  const [row] = await db.select().from(recurringRules).where(eq(recurringRules.id, ruleId));
  return row ?? notFound("Recurring rule");
}

/** Materialises planned transactions for one rule up to `until`. Idempotent. */
export async function generateForRule(rule: RecurringRule, until: ISODate = defaultHorizon()) {
  const dates = pendingOccurrences(rule, until);
  if (dates.length) {
    await db
      .insert(transactions)
      .values(
        dates.map((d) => ({
          title: rule.title,
          direction: rule.direction,
          amount: rule.amount,
          currency: rule.currency,
          accountId: rule.accountId,
          status: "upcoming" as const,
          date: d,
          dueDate: rule.dueOffsetDays != null ? addDays(d, rule.dueOffsetDays) : null,
          categoryId: rule.categoryId,
          payeeId: rule.payeeId,
          context: rule.context,
          recurringRuleId: rule.id,
          occurrenceDate: d,
        })),
      )
      .onConflictDoNothing();
  }
  if (rule.active && (!rule.generatedUntil || rule.generatedUntil < until)) {
    await db.update(recurringRules).set({ generatedUntil: until }).where(eq(recurringRules.id, rule.id));
  }
  return dates.length;
}

export async function generateAll(until: ISODate = defaultHorizon()) {
  const rules = await db.select().from(recurringRules).where(eq(recurringRules.active, true));
  let created = 0;
  for (const rule of rules) created += await generateForRule(rule, until);
  return { rules: rules.length, created };
}

/** Drops future, still-upcoming entries of a rule so they can be regenerated. Settled ones stay. */
async function dropFutureOccurrences(ruleId: number) {
  await db
    .delete(transactions)
    .where(
      and(
        eq(transactions.recurringRuleId, ruleId),
        eq(transactions.status, "upcoming"),
        gte(transactions.date, today()),
      ),
    );
}

async function accountCurrency(accountId: number) {
  const [acc] = await db.select({ currency: accounts.currency }).from(accounts).where(eq(accounts.id, accountId));
  return acc?.currency ?? notFound("Account");
}

export async function createRule(input: z.input<typeof createRuleInput>) {
  const data = createRuleInput.parse(input);
  const currency = await accountCurrency(data.accountId);
  const [rule] = await db.insert(recurringRules).values({ ...data, currency }).returning();
  await generateForRule(rule);
  return rule;
}

/**
 * Editing a rule rewrites its future upcoming entries (manual edits to those are lost);
 * past and settled entries are kept as they are.
 */
export async function updateRule(input: z.input<typeof updateRuleInput>) {
  const { id, ...data } = updateRuleInput.parse(input);
  await getRule(id);
  const currency = data.accountId ? await accountCurrency(data.accountId) : undefined;
  await dropFutureOccurrences(id);
  const [rule] = await db
    .update(recurringRules)
    .set({ ...data, ...(currency ? { currency } : {}), generatedUntil: addDays(today(), -1) })
    .where(eq(recurringRules.id, id))
    .returning();
  await generateForRule(rule);
  return rule;
}

export async function deleteRule(ruleId: number) {
  await dropFutureOccurrences(ruleId);
  await db.delete(recurringRules).where(eq(recurringRules.id, ruleId));
}
