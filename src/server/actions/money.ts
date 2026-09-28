"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { accounts, categories, payees, recurring, transactions } from "@/server/api";
import { requireSession } from "@/server/auth/session";
import { getWorkspace } from "@/server/workspace";
import { fmt, t } from "@/i18n";
import {
  bool,
  errorMessage,
  int,
  money,
  optDate,
  optInt,
  optStr,
  safeReturnTo,
  signedMoney,
  str,
  type ActionState,
} from "./form";

type Dir = "in" | "out";

/** Runs a mutation, returns a form error instead of throwing, then redirects on success. */
async function run(fn: () => Promise<unknown>, redirectTo?: string): Promise<ActionState> {
  await requireSession();
  try {
    await fn();
  } catch (err) {
    return { error: errorMessage(err), ts: Date.now() };
  }
  revalidatePath("/", "layout");
  if (redirectTo) redirect(redirectTo);
  return { ts: Date.now() };
}

/** For one-click row buttons: errors bubble to the error boundary. */
async function act(fn: () => Promise<unknown>) {
  await requireSession();
  await fn();
  revalidatePath("/", "layout");
}

// ---------- transactions ----------

function txFields(fd: FormData) {
  const direction = str(fd, "direction") as Dir;
  return {
    title: str(fd, "title"),
    direction,
    amount: money(fd, "amount"),
    accountId: int(fd, "accountId"),
    status: (optStr(fd, "status") ?? undefined) as "upcoming" | "invoiced" | "paid" | "received" | undefined,
    date: optDate(fd, "date"),
    dueDate: optStr(fd, "dueDate"),
    invoicedAt: optStr(fd, "invoicedAt"),
    categoryId: optInt(fd, "categoryId"),
    payeeId: optInt(fd, "payeeId"),
    projectId: optInt(fd, "projectId"),
    taskId: optInt(fd, "taskId"),
    notes: optStr(fd, "notes"),
  };
}

export async function createTransactionAction(_: ActionState, fd: FormData) {
  return run(() => transactions.createTransaction(txFields(fd)), safeReturnTo(fd, "/money/transactions"));
}

export async function updateTransactionAction(_: ActionState, fd: FormData) {
  return run(
    () => transactions.updateTransaction({ id: int(fd, "id"), ...txFields(fd) }),
    safeReturnTo(fd, "/money/transactions"),
  );
}

export async function quickAddAction(_: ActionState, fd: FormData): Promise<ActionState> {
  await requireSession();
  try {
    const tx = await transactions.quickAdd({
      text: str(fd, "text"),
      accountId: optInt(fd, "accountId"),
      workspace: await getWorkspace(),
    });
    revalidatePath("/", "layout");
    return { message: fmt(t.quickAdd.added, { title: tx.title }), ts: Date.now() };
  } catch (err) {
    return { error: errorMessage(err), ts: Date.now() };
  }
}

export async function settleAction(fd: FormData) {
  await act(() => transactions.settleTransaction({ id: int(fd, "id"), date: optDate(fd, "date") }));
}

export async function invoiceAction(fd: FormData) {
  await act(() => transactions.markInvoiced({ id: int(fd, "id") }));
}

export async function reopenAction(fd: FormData) {
  await act(() => transactions.reopenTransaction(int(fd, "id")));
}

export async function deleteTransactionAction(fd: FormData) {
  await act(() => transactions.deleteTransaction(int(fd, "id")));
  const to = safeReturnTo(fd, "");
  if (to) redirect(to);
}

export async function createTransferAction(_: ActionState, fd: FormData) {
  return run(
    () =>
      transactions.createTransfer({
        fromAccountId: int(fd, "fromAccountId"),
        toAccountId: int(fd, "toAccountId"),
        amount: money(fd, "amount"),
        amountIn: str(fd, "amountIn") ? money(fd, "amountIn") : undefined,
        date: optDate(fd, "date"),
        note: optStr(fd, "note"),
      }),
    "/money/transactions",
  );
}

// ---------- accounts ----------

export async function saveAccountAction(_: ActionState, fd: FormData) {
  const id = optInt(fd, "id");
  const common = {
    name: str(fd, "name"),
    type: str(fd, "type") as "bank" | "cash" | "card" | "other",
    openingBalance: signedMoney(fd, "openingBalance"),
    openingDate: optDate(fd, "openingDate"),
    notes: optStr(fd, "notes"),
  };
  const workspace = await getWorkspace();
  return run(
    () =>
      id
        ? accounts.updateAccount({ id, ...common, archived: bool(fd, "archived") })
        : accounts.createAccount({ ...common, workspace, currency: str(fd, "currency") as "EUR" | "RON" }),
    "/settings/accounts",
  );
}

export async function deleteAccountAction(_: ActionState, fd: FormData) {
  return run(() => accounts.deleteAccount(int(fd, "id")), "/settings/accounts");
}

// ---------- categories ----------

export async function createCategoryAction(_: ActionState, fd: FormData) {
  const workspace = await getWorkspace();
  return run(() =>
    categories.createCategory({
      workspace,
      name: str(fd, "name"),
      kind: str(fd, "kind") as "income" | "expense",
      parentId: optInt(fd, "parentId"),
    }),
  );
}

export async function renameCategoryAction(_: ActionState, fd: FormData) {
  return run(() => categories.updateCategory({ id: int(fd, "id"), name: str(fd, "name") }));
}

export async function toggleCategoryAction(fd: FormData) {
  await act(() => categories.updateCategory({ id: int(fd, "id"), archived: bool(fd, "archived") }));
}

export async function deleteCategoryAction(fd: FormData) {
  await act(() => categories.deleteCategory(int(fd, "id")));
}

export async function seedCategoriesAction() {
  const workspace = await getWorkspace();
  await act(() => categories.seedDefaultCategories(workspace));
}

// ---------- payees ----------

function payeeFields(fd: FormData) {
  return {
    name: str(fd, "name"),
    defaultDirection: (optStr(fd, "defaultDirection") as Dir | null) ?? null,
    defaultCategoryId: optInt(fd, "defaultCategoryId"),
    defaultAccountId: optInt(fd, "defaultAccountId"),
    notes: optStr(fd, "notes"),
  };
}

export async function savePayeeAction(_: ActionState, fd: FormData) {
  const id = optInt(fd, "id");
  return run(
    async () =>
      id
        ? payees.updatePayee({ id, ...payeeFields(fd) })
        : payees.createPayee({ ...payeeFields(fd), workspace: await getWorkspace() }),
    id ? "/settings/payees" : undefined,
  );
}

export async function deletePayeeAction(fd: FormData) {
  await act(() => payees.deletePayee(int(fd, "id")));
  redirect("/settings/payees");
}

// ---------- recurring ----------

function ruleFields(fd: FormData) {
  return {
    title: str(fd, "title"),
    direction: str(fd, "direction") as Dir,
    amount: money(fd, "amount"),
    accountId: int(fd, "accountId"),
    categoryId: optInt(fd, "categoryId"),
    payeeId: optInt(fd, "payeeId"),
    frequency: str(fd, "frequency") as "daily" | "weekly" | "monthly" | "yearly",
    interval: int(fd, "interval") || 1,
    startDate: str(fd, "startDate"),
    endDate: optStr(fd, "endDate"),
    dueOffsetDays: optInt(fd, "dueOffsetDays"),
    active: bool(fd, "active"),
    notes: optStr(fd, "notes"),
  };
}

export async function saveRuleAction(_: ActionState, fd: FormData) {
  const id = optInt(fd, "id");
  return run(
    () => (id ? recurring.updateRule({ id, ...ruleFields(fd) }) : recurring.createRule(ruleFields(fd))),
    "/settings/recurring",
  );
}

export async function deleteRuleAction(fd: FormData) {
  await act(() => recurring.deleteRule(int(fd, "id")));
  redirect("/settings/recurring");
}
