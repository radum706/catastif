import { asc, eq } from "drizzle-orm";
import { z } from "zod";
import { db } from "@/server/db/client";
import { accounts, transactions } from "@/server/db/schema";
import { today } from "@/lib/dates";
import { invalid, notFound } from "./errors";
import * as s from "./schemas";

export const createAccountInput = z.object({
  name: s.name,
  type: s.accountType.default("bank"),
  currency: s.currency,
  openingBalance: z.number().int().default(0),
  openingDate: s.isoDate.optional(),
  context: s.context.default("personal"),
  notes: s.notes,
});

export const updateAccountInput = z.object({
  id: s.id,
  name: s.name.optional(),
  type: s.accountType.optional(),
  openingBalance: z.number().int().optional(),
  openingDate: s.isoDate.optional(),
  context: s.context.optional(),
  archived: z.boolean().optional(),
  notes: s.notes,
});

export async function listAccounts(opts: { includeArchived?: boolean } = {}) {
  const rows = await db.select().from(accounts).orderBy(asc(accounts.archived), asc(accounts.name));
  return opts.includeArchived ? rows : rows.filter((a) => !a.archived);
}

export async function getAccount(accountId: number) {
  const [row] = await db.select().from(accounts).where(eq(accounts.id, accountId));
  return row ?? notFound("Account");
}

export async function createAccount(input: z.input<typeof createAccountInput>) {
  const data = createAccountInput.parse(input);
  const [row] = await db
    .insert(accounts)
    .values({ ...data, openingDate: data.openingDate ?? today() })
    .returning();
  return row;
}

/** Currency is fixed once created; it's what every transaction on the account is in. */
export async function updateAccount(input: z.input<typeof updateAccountInput>) {
  const { id, ...data } = updateAccountInput.parse(input);
  const [row] = await db.update(accounts).set(data).where(eq(accounts.id, id)).returning();
  return row ?? notFound("Account");
}

export async function deleteAccount(accountId: number) {
  const [used] = await db
    .select({ id: transactions.id })
    .from(transactions)
    .where(eq(transactions.accountId, accountId))
    .limit(1);
  if (used) invalid("Account has transactions. Archive it instead.");
  await db.delete(accounts).where(eq(accounts.id, accountId));
}
