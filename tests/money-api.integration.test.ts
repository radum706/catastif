import { afterAll, beforeEach, describe, expect, it } from "vitest";
import { hasDb, resetDb } from "./db";
import { closeDb } from "@/server/db/client";
import { accounts, categories, forecast, payees, payments, recurring, transactions } from "@/server/api";
import { addDays, addMonths, today } from "@/lib/dates";

describe.skipIf(!hasDb)("money API (integration)", () => {
  beforeEach(resetDb);
  afterAll(closeDb);

  it("tracks a bill from upcoming to paid and moves the balance", async () => {
    const acc = await accounts.createAccount({ name: "ING", workspace: "personal", currency: "RON", openingBalance: 100_000 });
    const bill = await transactions.createTransaction({
      title: "Electricity",
      direction: "out",
      amount: 23_000,
      accountId: acc.id,
      date: addDays(today(), 5),
      dueDate: addDays(today(), 5),
    });
    expect(bill.status).toBe("upcoming");
    expect(bill.currency).toBe("RON");

    let b = await forecast.balanceAt({ date: addDays(today(), 10) });
    expect(b.perAccount[0].current).toBe(100_000);
    expect(b.perAccount[0].atDate).toBe(77_000);

    const list = await payments.bills();
    expect(list.dueSoon.map((r) => r.tx.id)).toEqual([bill.id]);

    const paid = await transactions.settleTransaction({ id: bill.id });
    expect(paid.status).toBe("paid");
    expect(paid.settledAt).toBe(today());
    b = await forecast.balanceAt({ date: today() });
    expect(b.perAccount[0].current).toBe(77_000);

    const reopened = await transactions.reopenTransaction(bill.id);
    expect(reopened.status).toBe("upcoming");
    expect(reopened.settledAt).toBeNull();
  });

  it("moves income through invoiced → received", async () => {
    const acc = await accounts.createAccount({ name: "Revolut", workspace: "personal", currency: "EUR" });
    const inc = await transactions.createTransaction({
      title: "Client X – September",
      direction: "in",
      amount: 150_000,
      accountId: acc.id,
      status: "upcoming",
    });
    const inv = await transactions.markInvoiced({ id: inc.id, date: addDays(today(), -20), expectedDate: addDays(today(), 10) });
    expect(inv.status).toBe("invoiced");
    const collect = await payments.toCollect();
    expect(collect.invoiced[0].waitingDays).toBe(20);
    const rec = await transactions.settleTransaction({ id: inc.id });
    expect(rec.status).toBe("received");
    await expect(
      transactions.updateTransaction({ id: inc.id, status: "paid" }),
    ).rejects.toThrow(/not valid/);
  });

  it("rejects mismatched status and currency at the DB level too", async () => {
    const acc = await accounts.createAccount({ name: "Cash", workspace: "personal", type: "cash", currency: "RON" });
    await expect(
      transactions.createTransaction({ title: "x", direction: "out", amount: 1, accountId: acc.id, status: "invoiced" }),
    ).rejects.toThrow();
  });

  it("generates recurring entries and forecasts beyond the horizon", async () => {
    const acc = await accounts.createAccount({ name: "ING", workspace: "personal", currency: "RON", openingBalance: 0 });
    const start = addDays(today(), 1);
    const rule = await recurring.createRule({
      title: "Rent",
      direction: "out",
      amount: 200_000,
      accountId: acc.id,
      startDate: start,
      dueOffsetDays: 4,
    });
    const rows = await transactions.listTransactions({ accountId: acc.id });
    expect(rows.length).toBe(recurring.horizonMonths());
    expect(rows.every((r) => r.tx.recurringRuleId === rule.id && r.tx.status === "upcoming")).toBe(true);
    const first = rows.at(-1)!.tx;
    expect(first.dueDate).toBe(addDays(start, 4));

    // Idempotent.
    await recurring.generateAll();
    expect((await transactions.listTransactions({ accountId: acc.id })).length).toBe(rows.length);

    // 24 months out: 12 materialised + 12 computed on the fly (the 24th lands after the date).
    const far = addMonths(start, 23);
    const b = await forecast.balanceAt({ date: far });
    expect(b.perAccount[0].atDate).toBe(-24 * 200_000);

    // Editing the rule rewrites future entries.
    await recurring.updateRule({ id: rule.id, amount: 210_000 });
    const after = await transactions.listTransactions({ accountId: acc.id });
    expect(after.length).toBe(rows.length);
    expect(after.every((r) => r.tx.amount === 210_000)).toBe(true);

    await recurring.deleteRule(rule.id);
    expect(await transactions.listTransactions({ accountId: acc.id })).toHaveLength(0);
  });

  it("handles transfers, including EUR → RON", async () => {
    const eur = await accounts.createAccount({ name: "Revolut", workspace: "personal", currency: "EUR", openingBalance: 100_000 });
    const ron = await accounts.createAccount({ name: "ING", workspace: "personal", currency: "RON" });
    await transactions.createTransfer({ fromAccountId: eur.id, toAccountId: ron.id, amount: 10_000, amountIn: 49_700 });
    const b = await forecast.balanceAt({ date: today() });
    const byName = Object.fromEntries(b.perAccount.map((p) => [p.account.name, p.current]));
    expect(byName).toEqual({ Revolut: 90_000, ING: 49_700 });

    const summary = await payments.monthSummary();
    expect(summary.summary).toEqual([]); // transfers are not income or expense

    const [leg] = await transactions.listTransactions({ accountId: ron.id });
    await transactions.deleteTransaction(leg.tx.id);
    expect(await transactions.listTransactions()).toHaveLength(0);
  });

  it("computes safe to spend up to the next income", async () => {
    const acc = await accounts.createAccount({ name: "ING", workspace: "personal", currency: "RON", openingBalance: 500_000 });
    const base = { accountId: acc.id, status: "upcoming" as const };
    await transactions.createTransaction({ ...base, title: "Salary", direction: "in", amount: 450_000, date: addDays(today(), 10) });
    await transactions.createTransaction({ ...base, title: "Rent", direction: "out", amount: 200_000, date: addDays(today(), 3) });
    await transactions.createTransaction({ ...base, title: "Phone", direction: "out", amount: 5_000, date: addDays(today(), -2) });
    await transactions.createTransaction({ ...base, title: "Later", direction: "out", amount: 9_000, date: addDays(today(), 20) });
    const [s] = await forecast.safeToSpend();
    expect(s.nextIncome?.title).toBe("Salary");
    expect(s.billsBeforeIncome).toBe(205_000);
    expect(s.safe).toBe(295_000);

    const series = await forecast.forecastSeries({ to: addDays(today(), 30) });
    expect(series[0].points).toHaveLength(31);
    expect(series[0].low.balance).toBe(295_000);
    expect(series[0].points.at(-1)!.balance).toBe(500_000 + 450_000 - 214_000);
  });

  it("quick add uses payee defaults and the chosen account", async () => {
    const acc = await accounts.createAccount({ name: "Card", workspace: "personal", type: "card", currency: "RON" });
    const tx = await transactions.quickAdd({ text: "-45,90 Lidl groceries", accountId: acc.id, workspace: "personal" });
    expect(tx).toMatchObject({ amount: 4590, direction: "out", status: "paid", title: "Lidl groceries" });
    await expect(transactions.quickAdd({ text: "Lidl", accountId: acc.id, workspace: "personal" })).rejects.toThrow(/amount/);
  });

  it("keeps work and personal apart", async () => {
    const home = await accounts.createAccount({ name: "ING", workspace: "personal", currency: "RON", openingBalance: 1_000 });
    const biz = await accounts.createAccount({ name: "BT Business", workspace: "work", currency: "RON", openingBalance: 50_000 });
    await categories.seedDefaultCategories("personal");
    await categories.seedDefaultCategories("work");
    const personalCats = await categories.listCategories({ workspace: "personal" });
    const workCats = await categories.listCategories({ workspace: "work" });
    expect(personalCats.some((c) => c.name === "Groceries")).toBe(true);
    expect(workCats.some((c) => c.name === "Groceries")).toBe(false);

    // Workspace comes from the account.
    const tx = await transactions.createTransaction({ title: "Invoice 12", direction: "in", amount: 10_000, accountId: biz.id });
    expect(tx.workspace).toBe("work");

    // A personal category on a work transaction is refused.
    const groceries = personalCats.find((c) => c.name === "Groceries")!;
    await expect(
      transactions.createTransaction({ title: "x", direction: "out", amount: 1, accountId: biz.id, categoryId: groceries.id }),
    ).rejects.toThrow(/other workspace/);

    // Same-name payees can exist in both workspaces.
    await payees.createPayee({ name: "Dedeman", workspace: "personal" });
    await payees.createPayee({ name: "Dedeman", workspace: "work" });

    // Balances and bills are per workspace.
    const p = await forecast.balanceAt({ date: today(), workspace: "personal" });
    expect(p.perAccount.map((b) => b.account.id)).toEqual([home.id]);
    const w = await forecast.balanceAt({ date: today(), workspace: "work" });
    expect(w.totals[0].current).toBe(60_000);

    // Quick add only sees the workspace's accounts.
    await expect(transactions.quickAdd({ text: "-10 test", accountId: biz.id, workspace: "personal" })).rejects.toThrow(/other workspace/);

    // Transfers may cross workspaces (e.g. paying yourself); each leg stays in its account's workspace.
    await transactions.createTransfer({ fromAccountId: biz.id, toAccountId: home.id, amount: 5_000 });
    const legs = await transactions.listTransactions({ q: "Transfer" });
    expect(legs.map((l) => l.tx.workspace).sort()).toEqual(["personal", "work"]);
  });
});
