import Link from "next/link";
import { ForecastChart } from "@/components/forecast-chart";
import { Badge, Empty, Field, Money, PageHeader, Section } from "@/components/ui";
import { addMonths, formatDate, formatShortDate, isISODate, today } from "@/lib/dates";
import { formatMoney } from "@/lib/money";
import { forecast } from "@/server/api";
import { param } from "@/server/form-data";
import { fmt, t } from "@/i18n";

export const metadata = { title: t.forecast.title };

const PRESETS = { "1m": 1, "3m": 3, "6m": 6, "1y": 12 } as const;

export default async function ForecastPage({ searchParams }: PageProps<"/forecast">) {
  const sp = await searchParams;
  const now = today();
  const raw = param(sp, "date");
  const date = raw && isISODate(raw) ? raw : addMonths(now, 1);
  const [bal, series] = await Promise.all([forecast.balanceAt({ date }), forecast.forecastSeries({ to: date })]);
  const planned = bal.planned.filter((p) => !p.isTransfer);
  const accountName = new Map(bal.perAccount.map((b) => [b.account.id, b.account.name]));

  return (
    <>
      <PageHeader title={t.forecast.title} />
      <form className="card mb-6 flex flex-wrap items-end gap-3 p-4">
        <Field label={t.forecast.date}>
          <input type="date" name="date" defaultValue={date} className="input" />
        </Field>
        <button className="btn btn-primary">{t.forecast.show}</button>
        <div className="flex flex-wrap gap-1.5">
          {Object.entries(PRESETS).map(([k, m]) => (
            <Link key={k} href={`/forecast?date=${addMonths(now, m)}`} className="btn btn-sm">
              {t.forecast.presets[k as keyof typeof PRESETS]}
            </Link>
          ))}
        </div>
      </form>

      <div className="mb-6 grid gap-3 sm:grid-cols-2">
        {bal.totals.map((tot) => {
          const s = series.find((x) => x.currency === tot.currency);
          return (
            <div key={tot.currency} className="card p-4">
              <p className="label">{fmt(t.forecast.at, { date: formatDate(date) })} · {tot.currency}</p>
              <p className={`num text-3xl font-semibold ${tot.atDate < 0 ? "text-out" : ""}`}>{formatMoney(tot.atDate, tot.currency)}</p>
              <p className="mt-1 text-sm text-muted">
                {t.forecast.now}: {formatMoney(tot.current, tot.currency)} · {t.forecast.change}:{" "}
                <Money amount={tot.atDate - tot.current} currency={tot.currency} />
              </p>
              {s && date >= now && (
                <p className={`mt-1 text-xs ${s.low.balance < 0 ? "text-out" : "text-muted"}`}>
                  {fmt(t.forecast.lowest, { amount: formatMoney(s.low.balance, tot.currency), date: formatShortDate(s.low.date) })}
                </p>
              )}
            </div>
          );
        })}
      </div>

      {date > now && series.map((s) => <div key={s.currency} className="mb-6"><ForecastChart {...s} /></div>)}

      <Section title={t.forecast.perAccount}>
        <div className="card overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="text-left text-xs uppercase text-muted">
              <tr>
                <th className="px-4 py-2 font-medium">{t.tx.account}</th>
                <th className="px-4 py-2 text-right font-medium">{t.forecast.now}</th>
                <th className="px-4 py-2 text-right font-medium">{formatShortDate(date)}</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-border">
              {bal.perAccount.map((b) => (
                <tr key={b.account.id}>
                  <td className="px-4 py-2">{b.account.name} <span className="text-xs text-muted">{b.account.currency}</span></td>
                  <td className="px-4 py-2 text-right"><Money amount={b.current} currency={b.account.currency} colored={b.current < 0} /></td>
                  <td className="px-4 py-2 text-right"><Money amount={b.atDate} currency={b.account.currency} colored={b.atDate < 0} /></td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </Section>

      {date >= now && (
        <Section title={`${t.forecast.planned} (${planned.length})`}>
          {planned.length === 0 ? (
            <Empty>{t.forecast.noPlanned}</Empty>
          ) : (
            <ul className="card divide-y divide-border">
              {planned.map((p, i) => (
                <li key={`${p.transactionId ?? "v"}-${i}`} className="flex items-center justify-between gap-3 px-4 py-2 text-sm">
                  <span className="min-w-0">
                    <span className="mr-2 text-xs text-muted">{formatShortDate(p.date)}</span>
                    {p.transactionId ? (
                      <Link href={`/transactions/${p.transactionId}`} className="hover:underline">{p.title}</Link>
                    ) : (
                      p.title
                    )}{" "}
                    <span className="text-xs text-muted">· {accountName.get(p.accountId)}</span>{" "}
                    {p.virtual && <Badge>↻ {t.forecast.virtual}</Badge>}
                    {p.overdue && <Badge tone="danger">{t.bills.overdue}</Badge>}
                  </span>
                  <Money amount={Math.abs(p.amount)} currency={p.currency} direction={p.direction} />
                </li>
              ))}
            </ul>
          )}
        </Section>
      )}
    </>
  );
}
