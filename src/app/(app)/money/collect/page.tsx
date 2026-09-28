import { TxList, TxRow } from "@/components/tx-row";
import { Badge, Empty, LinkButton, Money, PageHeader, Section } from "@/components/ui";
import type { CurrencyCode } from "@/lib/money";
import { payments } from "@/server/api";
import type { CollectRow } from "@/server/api/payments";
import { getWorkspace } from "@/server/workspace";
import { fmt, t } from "@/i18n";

export const metadata = { title: t.collect.title };

function Totals({ rows }: { rows: { tx: { amount: number; currency: CurrencyCode } }[] }) {
  const m = new Map<CurrencyCode, number>();
  for (const r of rows) m.set(r.tx.currency, (m.get(r.tx.currency) ?? 0) + r.tx.amount);
  return (
    <span className="flex gap-3 text-sm">
      {[...m.entries()].map(([cur, sum]) => (
        <Money key={cur} amount={sum} currency={cur} colored={false} />
      ))}
    </span>
  );
}

function Wait({ row }: { row: CollectRow }) {
  return (
    <>
      {row.tx.invoicedAt && <Badge tone={row.waitingDays > 30 ? "danger" : "accent"}>{fmt(t.collect.waiting, { n: row.waitingDays })}</Badge>}
      {row.late && <Badge tone="warn">{t.collect.late}</Badge>}
    </>
  );
}

function Group({ title, rows }: { title: string; rows: CollectRow[] }) {
  if (!rows.length) return null;
  return (
    <Section title={`${title} (${rows.length})`} aside={<Totals rows={rows} />}>
      <TxList>
        {rows.map((r) => (
          <TxRow key={r.tx.id} row={r} showStatus={false} meta={<Wait row={r} />} />
        ))}
      </TxList>
    </Section>
  );
}

export default async function CollectPage() {
  const c = await payments.toCollect({ workspace: await getWorkspace() });
  return (
    <>
      <PageHeader
        title={t.collect.title}
        intro={t.collect.intro}
        actions={<LinkButton href="/money/transactions/new?direction=in&status=upcoming&returnTo=/money/collect" primary>+ {t.collect.addIncome}</LinkButton>}
      />
      {c.invoiced.length + c.expected.length === 0 && <Empty />}
      <Group title={t.collect.invoiced} rows={c.invoiced} />
      <Group title={t.collect.expected} rows={c.expected} />
      {c.receivedThisMonth.length > 0 && (
        <Section title={`${t.collect.receivedThisMonth} (${c.receivedThisMonth.length})`} aside={<Totals rows={c.receivedThisMonth} />}>
          <TxList>
            {c.receivedThisMonth.map((r) => (
              <TxRow key={r.tx.id} row={r} />
            ))}
          </TxList>
        </Section>
      )}
    </>
  );
}
