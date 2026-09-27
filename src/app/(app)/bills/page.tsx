import { TxList, TxRow } from "@/components/tx-row";
import { Badge, Empty, LinkButton, Money, PageHeader, Section } from "@/components/ui";
import { formatShortDate } from "@/lib/dates";
import type { CurrencyCode } from "@/lib/money";
import { payments } from "@/server/api";
import type { BillRow } from "@/server/api/payments";
import { fmt, t } from "@/i18n";

export const metadata = { title: t.bills.title };

function totals(rows: { tx: { amount: number; currency: CurrencyCode } }[]) {
  const m = new Map<CurrencyCode, number>();
  for (const r of rows) m.set(r.tx.currency, (m.get(r.tx.currency) ?? 0) + r.tx.amount);
  return [...m.entries()];
}

function Totals({ rows }: { rows: { tx: { amount: number; currency: CurrencyCode } }[] }) {
  if (!rows.length) return null;
  return (
    <span className="flex gap-3 text-sm">
      {totals(rows).map(([cur, sum]) => (
        <Money key={cur} amount={sum} currency={cur} colored={false} />
      ))}
    </span>
  );
}

function DueBadge({ row }: { row: BillRow }) {
  if (row.daysLeft < 0) return <Badge tone="danger">{fmt(t.bills.overdueBy, { n: -row.daysLeft })}</Badge>;
  if (row.daysLeft === 0) return <Badge tone="warn">{t.bills.dueToday}</Badge>;
  return <Badge tone={row.daysLeft <= 7 ? "warn" : "neutral"}>{fmt(t.bills.dueIn, { n: row.daysLeft })} · {formatShortDate(row.due)}</Badge>;
}

function BillGroup({ title, rows }: { title: string; rows: BillRow[] }) {
  if (!rows.length) return null;
  return (
    <Section title={`${title} (${rows.length})`} aside={<Totals rows={rows} />}>
      <TxList>
        {rows.map((r) => (
          <TxRow key={r.tx.id} row={r} showStatus={false} meta={<DueBadge row={r} />} />
        ))}
      </TxList>
    </Section>
  );
}

export default async function BillsPage() {
  const b = await payments.bills();
  const open = b.overdue.length + b.dueSoon.length + b.later.length;
  return (
    <>
      <PageHeader
        title={t.bills.title}
        intro={t.bills.intro}
        actions={<LinkButton href="/transactions/new?direction=out&status=upcoming&returnTo=/bills" primary>+ {t.bills.addBill}</LinkButton>}
      />
      {open === 0 && <Empty />}
      <BillGroup title={t.bills.overdue} rows={b.overdue} />
      <BillGroup title={t.bills.dueSoon} rows={b.dueSoon} />
      <BillGroup title={t.bills.later} rows={b.later} />
      {b.paidThisMonth.length > 0 && (
        <Section title={`${t.bills.paidThisMonth} (${b.paidThisMonth.length})`} aside={<Totals rows={b.paidThisMonth} />}>
          <TxList>
            {b.paidThisMonth.map((r) => (
              <TxRow key={r.tx.id} row={r} />
            ))}
          </TxList>
        </Section>
      )}
    </>
  );
}
