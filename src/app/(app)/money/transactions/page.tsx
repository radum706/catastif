import Link from "next/link";
import { TxList, TxRow } from "@/components/tx-row";
import { Empty, Field, Money, PageHeader } from "@/components/ui";
import { addDays, formatShortDate, today } from "@/lib/dates";
import type { CurrencyCode } from "@/lib/money";
import { accounts, categories, payees, transactions } from "@/server/api";
import { param } from "@/server/form-data";
import { getWorkspace } from "@/server/workspace";
import { fmt, t } from "@/i18n";

export const metadata = { title: t.tx.listTitle };

const STATUSES = ["upcoming", "invoiced", "paid", "received"] as const;
type Status = (typeof STATUSES)[number];
const numOrUndef = (v?: string) => (v && /^\d+$/.test(v) ? Number(v) : undefined);
const dateOrUndef = (v?: string) => (v && /^\d{4}-\d{2}-\d{2}$/.test(v) ? v : undefined);

export default async function TransactionsPage({ searchParams }: PageProps<"/money/transactions">) {
  const sp = await searchParams;
  const f = {
    q: param(sp, "q") || undefined,
    accountId: numOrUndef(param(sp, "account")),
    categoryId: numOrUndef(param(sp, "category")),
    payeeId: numOrUndef(param(sp, "payee")),
    direction: (["in", "out"].includes(param(sp, "direction") ?? "") ? param(sp, "direction") : undefined) as "in" | "out" | undefined,
    status: STATUSES.includes(param(sp, "status") as Status) ? [param(sp, "status") as Status] : undefined,
    from: dateOrUndef(param(sp, "from")),
    to: dateOrUndef(param(sp, "to")),
  };
  // Recurring rules plan a year ahead; by default stop a month out so today isn't buried.
  const defaultTo = f.to ? undefined : addDays(today(), 31);
  const ws = await getWorkspace();
  const [rows, accs, cats, pays] = await Promise.all([
    transactions.listTransactions({ ...f, workspace: ws, to: f.to ?? defaultTo, limit: 300 }),
    accounts.listAccounts({ workspace: ws, includeArchived: true }),
    categories.listCategories({ workspace: ws }),
    payees.listPayees({ workspace: ws }),
  ]);

  const net = new Map<CurrencyCode, number>();
  for (const r of rows) net.set(r.tx.currency, (net.get(r.tx.currency) ?? 0) + (r.tx.direction === "in" ? r.tx.amount : -r.tx.amount));

  const sel = (name: string, value: number | string | undefined, options: { v: string | number; l: string }[], label: string) => (
    <Field label={label}>
      <select name={name} defaultValue={value ?? ""} className="input">
        <option value="">{t.common.all}</option>
        {options.map((o) => (
          <option key={o.v} value={o.v}>{o.l}</option>
        ))}
      </select>
    </Field>
  );

  return (
    <>
      <PageHeader
        title={t.tx.listTitle}
        actions={
          <>
            <Link href="/money/transfers/new" className="btn">⇄ {t.tx.newTransfer}</Link>
            <Link href="/money/transactions/new" className="btn btn-primary">+ {t.tx.add}</Link>
          </>
        }
      />
      <details className="card mb-4 p-4" open={Object.values(f).some((v) => v !== undefined)}>
        <summary className="cursor-pointer text-sm font-medium">{t.common.filter}</summary>
        <form className="mt-3 grid gap-3 sm:grid-cols-3 lg:grid-cols-4">
          <Field label={t.tx.search}>
            <input name="q" defaultValue={f.q} className="input" />
          </Field>
          {sel("account", f.accountId, accs.map((a) => ({ v: a.id, l: `${a.name} · ${a.currency}` })), t.tx.account)}
          {sel("category", f.categoryId, cats.map((c) => ({ v: c.id, l: `${c.name} (${t.enums.categoryKind[c.kind]})` })), t.tx.category)}
          {sel("payee", f.payeeId, pays.map((p) => ({ v: p.id, l: p.name })), t.tx.payee)}
          {sel("direction", f.direction, [{ v: "in", l: t.enums.direction.in }, { v: "out", l: t.enums.direction.out }], t.tx.direction)}
          {sel("status", f.status?.[0], STATUSES.map((s) => ({ v: s, l: t.enums.status[s] })), t.tx.status)}
          <div className="grid grid-cols-2 gap-2">
            <Field label={t.tx.from}>
              <input type="date" name="from" defaultValue={f.from} className="input" />
            </Field>
            <Field label={t.tx.to}>
              <input type="date" name="to" defaultValue={f.to} className="input" />
            </Field>
          </div>
          <div className="flex items-end gap-2 sm:col-span-3 lg:col-span-4">
            <button className="btn btn-primary">{t.common.filter}</button>
            <Link href="/money/transactions" className="btn">{t.common.reset}</Link>
          </div>
        </form>
      </details>

      <div className="mb-2 flex flex-wrap items-center justify-between gap-2 text-sm text-muted">
        <span>
          {fmt(t.tx.count, { n: rows.length })}
          {defaultTo && <> · {fmt(t.tx.futureHidden, { date: formatShortDate(defaultTo) })}</>}
        </span>
        <span className="flex gap-3">
          {[...net.entries()].map(([cur, v]) => (
            <Money key={cur} amount={v} currency={cur} />
          ))}
        </span>
      </div>
      {rows.length ? (
        <TxList>
          {rows.map((r) => (
            <TxRow key={r.tx.id} row={r} />
          ))}
        </TxList>
      ) : (
        <Empty />
      )}
    </>
  );
}
