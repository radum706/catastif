import { and, asc, desc, eq, gte, ilike, inArray, isNotNull, isNull, lte, or, sql, type SQL } from "drizzle-orm";
import { alias } from "drizzle-orm/pg-core";
import { z } from "zod";
import { db } from "@/server/db/client";
import { accounts, categories, payees, transactions, transfers, type Transaction, type Workspace } from "@/server/db/schema";
import { today } from "@/lib/dates";
import { parseQuickAdd } from "@/lib/quick-add";
import { invalid, notFound } from "./errors";
import * as s from "./schemas";
import { accountRef, assertCategoryIn, assertPayeeIn, assertProjectIn, assertTaskIn } from "./workspace";

const SETTLED = ["paid", "received"] as const;
export const isSettled = (status: string) => (SETTLED as readonly string[]).includes(status);

function allowedStatus(direction: "in" | "out", status: string): boolean {
  return direction === "out"
    ? status === "upcoming" || status === "paid"
    : status === "upcoming" || status === "invoiced" || status === "received";
}

export const createTransactionInput = z.object({
  title: s.name,
  direction: s.direction,
  amount: s.amount,
  accountId: s.id,
  status: s.txStatus.optional(),
  date: s.isoDate.optional(),
  dueDate: s.isoDate.nullish(),
  invoicedAt: s.isoDate.nullish(),
  categoryId: s.optionalId,
  payeeId: s.optionalId,
  projectId: s.optionalId,
  taskId: s.optionalId,
  notes: s.notes,
});

export const updateTransactionInput = createTransactionInput.partial().extend({ id: s.id });

export const listTransactionsInput = z.object({
  from: s.isoDate.optional(),
  to: s.isoDate.optional(),
  accountId: s.optionalId,
  categoryId: s.optionalId,
  payeeId: s.optionalId,
  direction: s.direction.optional(),
  status: z.array(s.txStatus).optional(),
  workspace: s.workspace.optional(),
  projectId: s.optionalId,
  taskId: s.optionalId,
  q: z.string().trim().max(200).optional(),
  includeTransfers: z.boolean().default(true),
  limit: z.number().int().min(1).max(1000).default(200),
  offset: z.number().int().min(0).default(0),
});

/** Default status: settled if it's today or in the past, upcoming if in the future. */
function defaultStatus(direction: "in" | "out", date: string) {
  if (date > today()) return "upcoming" as const;
  return direction === "in" ? ("received" as const) : ("paid" as const);
}

/** Category, payee (and later project/task) must live in the transaction's workspace. */
async function checkLinks(
  workspace: Workspace,
  data: { categoryId?: number | null; payeeId?: number | null; projectId?: number | null; taskId?: number | null },
) {
  await assertCategoryIn(data.categoryId, workspace);
  await assertPayeeIn(data.payeeId, workspace);
  await assertProjectIn(data.projectId, workspace);
  await assertTaskIn(data.taskId, workspace);
}

/** Keeps settledAt / invoicedAt consistent with the status. */
function lifecycleFields(
  status: string,
  date: string,
  prev?: Pick<Transaction, "settledAt" | "invoicedAt">,
): { settledAt: string | null; invoicedAt?: string | null } {
  if (isSettled(status)) return { settledAt: prev?.settledAt ?? date };
  if (status === "invoiced") return { settledAt: null, invoicedAt: prev?.invoicedAt ?? today() };
  return { settledAt: null };
}

export async function createTransaction(input: z.input<typeof createTransactionInput>) {
  const data = createTransactionInput.parse(input);
  const date = data.date ?? today();
  const status = data.status ?? defaultStatus(data.direction, date);
  if (!allowedStatus(data.direction, status)) invalid(`Status "${status}" is not valid for money ${data.direction}`);
  const { currency, workspace } = await accountRef(data.accountId);
  await checkLinks(workspace, data);
  const [row] = await db
    .insert(transactions)
    .values({
      ...data,
      date,
      status,
      currency,
      workspace,
      invoicedAt: data.invoicedAt ?? null,
      ...lifecycleFields(status, date, { settledAt: null, invoicedAt: data.invoicedAt ?? null }),
    })
    .returning();
  return row;
}

export async function getTransaction(txId: number) {
  const [row] = await db.select().from(transactions).where(eq(transactions.id, txId));
  return row ?? notFound("Transaction");
}

export async function updateTransaction(input: z.input<typeof updateTransactionInput>) {
  const { id, ...data } = updateTransactionInput.parse(input);
  const current = await getTransaction(id);
  const moved =
    (data.direction && data.direction !== current.direction) ||
    (data.accountId && data.accountId !== current.accountId);
  if (current.transferId && moved) {
    invalid("Edit the transfer instead of changing its legs' account or direction");
  }
  const direction = data.direction ?? current.direction;
  const status = data.status ?? current.status;
  const date = data.date ?? current.date;
  if (!allowedStatus(direction, status)) invalid(`Status "${status}" is not valid for money ${direction}`);
  const { currency, workspace } = data.accountId
    ? await accountRef(data.accountId)
    : { currency: current.currency, workspace: current.workspace };
  await checkLinks(workspace, {
    categoryId: data.categoryId !== undefined ? data.categoryId : current.categoryId,
    payeeId: data.payeeId !== undefined ? data.payeeId : current.payeeId,
    projectId: data.projectId !== undefined ? data.projectId : current.projectId,
    taskId: data.taskId !== undefined ? data.taskId : current.taskId,
  });
  const statusChanged = status !== current.status;
  const lifecycle = lifecycleFields(status, date, statusChanged ? undefined : current);
  if (data.invoicedAt !== undefined) lifecycle.invoicedAt = data.invoicedAt;
  else if (statusChanged && status === "upcoming") lifecycle.invoicedAt = null;
  // If the date of a settled transaction is edited, the settlement date follows it.
  if (isSettled(status) && data.date) lifecycle.settledAt = data.date;
  const [row] = await db
    .update(transactions)
    .set({ ...data, currency, workspace, ...lifecycle })
    .where(eq(transactions.id, id))
    .returning();
  return row;
}

/** Bill paid / income received. The cash date becomes the settlement date. */
export async function settleTransaction(input: { id: number; date?: string; amount?: number }) {
  const { id, date, amount } = z
    .object({ id: s.id, date: s.isoDate.optional(), amount: s.amount.optional() })
    .parse(input);
  const tx = await getTransaction(id);
  if (isSettled(tx.status)) return tx;
  const when = date ?? today();
  const [row] = await db
    .update(transactions)
    .set({
      status: tx.direction === "in" ? "received" : "paid",
      settledAt: when,
      date: when,
      ...(amount ? { amount } : {}),
    })
    .where(eq(transactions.id, id))
    .returning();
  return row;
}

/** Income billed to a client; `expectedDate` is when you expect the money (the cash date). */
export async function markInvoiced(input: { id: number; date?: string; expectedDate?: string }) {
  const { id, date, expectedDate } = z
    .object({ id: s.id, date: s.isoDate.optional(), expectedDate: s.isoDate.optional() })
    .parse(input);
  const tx = await getTransaction(id);
  if (tx.direction !== "in") invalid("Only money in can be invoiced");
  if (tx.status !== "upcoming") invalid("Only upcoming income can be marked invoiced");
  const [row] = await db
    .update(transactions)
    .set({ status: "invoiced", invoicedAt: date ?? today(), ...(expectedDate ? { date: expectedDate } : {}) })
    .where(eq(transactions.id, id))
    .returning();
  return row;
}

/** Undo a settlement (or an invoice). */
export async function reopenTransaction(txId: number) {
  const tx = await getTransaction(txId);
  const status = isSettled(tx.status) && tx.direction === "in" && tx.invoicedAt ? "invoiced" : "upcoming";
  const [row] = await db
    .update(transactions)
    .set({ status, settledAt: null, ...(status === "upcoming" ? { invoicedAt: null } : {}) })
    .where(eq(transactions.id, txId))
    .returning();
  return row;
}

export async function deleteTransaction(txId: number) {
  const tx = await getTransaction(txId);
  if (tx.transferId) {
    // Deleting either leg removes the whole transfer.
    await db.delete(transfers).where(eq(transfers.id, tx.transferId));
  } else {
    await db.delete(transactions).where(eq(transactions.id, txId));
  }
}

export const createTransferInput = z.object({
  fromAccountId: s.id,
  toAccountId: s.id,
  amount: s.amount,
  /** Only needed when the currencies differ (e.g. EUR → RON). */
  amountIn: s.amount.optional(),
  date: s.isoDate.optional(),
  note: s.notes,
});

export async function createTransfer(input: z.input<typeof createTransferInput>) {
  const data = createTransferInput.parse(input);
  if (data.fromAccountId === data.toAccountId) invalid("Pick two different accounts");
  const [from] = await db.select().from(accounts).where(eq(accounts.id, data.fromAccountId));
  const [to] = await db.select().from(accounts).where(eq(accounts.id, data.toAccountId));
  if (!from || !to) notFound("Account");
  const amountIn = data.amountIn ?? data.amount;
  if (from.currency === to.currency && amountIn !== data.amount) {
    invalid("Same-currency transfers must have equal amounts");
  }
  const date = data.date ?? today();
  const upcoming = date > today();

  return db.transaction(async (tx) => {
    const [transfer] = await tx.insert(transfers).values({ date, note: data.note }).returning();
    const common = { transferId: transfer.id, date, notes: data.note };
    await tx.insert(transactions).values([
      {
        ...common,
        title: `Transfer to ${to.name}`,
        direction: "out",
        amount: data.amount,
        accountId: from.id,
        currency: from.currency,
        workspace: from.workspace,
        status: upcoming ? "upcoming" : "paid",
        settledAt: upcoming ? null : date,
      },
      {
        ...common,
        title: `Transfer from ${from.name}`,
        direction: "in",
        amount: amountIn,
        accountId: to.id,
        currency: to.currency,
        workspace: to.workspace,
        status: upcoming ? "upcoming" : "received",
        settledAt: upcoming ? null : date,
      },
    ]);
    return transfer;
  });
}

export const quickAddInput = z.object({
  text: z.string().trim().min(1).max(500),
  workspace: s.workspace,
  accountId: s.optionalId,
});

/** One-line entry, e.g. "-45 Lidl food". The form's account wins over the payee default. */
export async function quickAdd(input: z.input<typeof quickAddInput>) {
  const { text, accountId, workspace } = quickAddInput.parse(input);
  const [payeeRows, categoryRows] = await Promise.all([
    db.select().from(payees).where(and(eq(payees.archived, false), eq(payees.workspace, workspace))),
    db.select().from(categories).where(and(eq(categories.archived, false), eq(categories.workspace, workspace))),
  ]);
  const parsed = parseQuickAdd(text, { today: today(), payees: payeeRows, categories: categoryRows });
  if (!parsed.amount) invalid("No amount found. Try something like “-45 Lidl food”.");
  const account = accountId ?? parsed.accountId;
  if (!account) invalid("Pick an account");
  if ((await accountRef(account)).workspace !== workspace) invalid("Account belongs to the other workspace");
  return createTransaction({
    title: parsed.title,
    direction: parsed.direction,
    amount: parsed.amount,
    accountId: account,
    status: parsed.status,
    date: parsed.date,
    dueDate: parsed.dueDate,
    categoryId: parsed.categoryId,
    payeeId: parsed.payeeId,
  });
}

const categoryTable = categories;
const parentCategory = alias(categories, "parent_category");

export async function listTransactions(input: z.input<typeof listTransactionsInput> = {}) {
  const f = listTransactionsInput.parse(input);
  const where: SQL[] = [];
  if (f.from) where.push(gte(transactions.date, f.from));
  if (f.to) where.push(lte(transactions.date, f.to));
  if (f.accountId) where.push(eq(transactions.accountId, f.accountId));
  if (f.categoryId) {
    where.push(
      or(eq(transactions.categoryId, f.categoryId), eq(categoryTable.parentId, f.categoryId))!,
    );
  }
  if (f.payeeId) where.push(eq(transactions.payeeId, f.payeeId));
  if (f.direction) where.push(eq(transactions.direction, f.direction));
  if (f.status?.length) where.push(inArray(transactions.status, f.status));
  if (f.workspace) where.push(eq(transactions.workspace, f.workspace));
  if (f.projectId) where.push(eq(transactions.projectId, f.projectId));
  if (f.taskId) where.push(eq(transactions.taskId, f.taskId));
  if (!f.includeTransfers) where.push(isNull(transactions.transferId));
  if (f.q) {
    const like = `%${f.q.replace(/[%_\\]/g, "\\$&")}%`;
    where.push(
      or(ilike(transactions.title, like), ilike(transactions.notes, like), ilike(payees.name, like))!,
    );
  }

  return db
    .select({
      tx: transactions,
      accountName: accounts.name,
      categoryName: categoryTable.name,
      parentCategoryName: parentCategory.name,
      payeeName: payees.name,
    })
    .from(transactions)
    .innerJoin(accounts, eq(accounts.id, transactions.accountId))
    .leftJoin(categoryTable, eq(categoryTable.id, transactions.categoryId))
    .leftJoin(parentCategory, eq(parentCategory.id, categoryTable.parentId))
    .leftJoin(payees, eq(payees.id, transactions.payeeId))
    .where(where.length ? and(...where) : undefined)
    .orderBy(desc(transactions.date), desc(transactions.id))
    .limit(f.limit)
    .offset(f.offset);
}

export type TransactionRow = Awaited<ReturnType<typeof listTransactions>>[number];

/** Open (not settled) transactions, oldest first. Used by bills, collect and forecast. */
export async function listOpen(
  opts: { direction?: "in" | "out"; to?: string; excludeTransfers?: boolean; workspace?: Workspace } = {},
) {
  const where: SQL[] = [inArray(transactions.status, ["upcoming", "invoiced"])];
  if (opts.workspace) where.push(eq(transactions.workspace, opts.workspace));
  if (opts.direction) where.push(eq(transactions.direction, opts.direction));
  if (opts.to) where.push(lte(transactions.date, opts.to));
  if (opts.excludeTransfers) where.push(isNull(transactions.transferId));
  return db
    .select({
      tx: transactions,
      accountName: accounts.name,
      categoryName: categoryTable.name,
      parentCategoryName: parentCategory.name,
      payeeName: payees.name,
    })
    .from(transactions)
    .innerJoin(accounts, eq(accounts.id, transactions.accountId))
    .leftJoin(categoryTable, eq(categoryTable.id, transactions.categoryId))
    .leftJoin(parentCategory, eq(parentCategory.id, categoryTable.parentId))
    .leftJoin(payees, eq(payees.id, transactions.payeeId))
    .where(and(...where))
    .orderBy(asc(sql`coalesce(${transactions.dueDate}, ${transactions.date})`), asc(transactions.id));
}

/** Settled totals per account, optionally up to a date. */
export async function settledTotals(upTo?: string) {
  const where: SQL[] = [isNotNull(transactions.settledAt)];
  if (upTo) where.push(lte(transactions.date, upTo));
  const rows = await db
    .select({
      accountId: transactions.accountId,
      total: sql<string>`coalesce(sum(case when ${transactions.direction} = 'in' then ${transactions.amount} else -${transactions.amount} end), 0)`,
    })
    .from(transactions)
    .where(and(...where))
    .groupBy(transactions.accountId);
  return new Map(rows.map((r) => [r.accountId, Number(r.total)]));
}
