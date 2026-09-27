import Link from "next/link";
import { QuickAdd } from "@/components/quick-add";
import { TxList, TxRow } from "@/components/tx-row";
import { Empty, LinkButton, Money, PageHeader, Section } from "@/components/ui";
import { formatShortDate, today } from "@/lib/dates";
import { formatMoney } from "@/lib/money";
import { accounts, categories, forecast, payees, payments, transactions } from "@/server/api";
import { fmt, t } from "@/i18n";

export const metadata = { title: t.home.title };

export default async function HomePage() {
  const now = today();
  const [accs, safe, balances, month, spending, counts, payeeRows, categoryRows, recent] = await Promise.all([
    accounts.listAccounts(),
    forecast.safeToSpend(),
    forecast.balanceAt({ date: now }),
    payments.monthSummary(now),
    payments.spendingByCategory(now),
    payments.openCounts(),
    payees.listPayees(),
    categories.listCategories(),
    transactions.listTransactions({ limit: 6, to: now }),
  ]);

  if (!accs.length) {
    return (
      <>
        <PageHeader title={t.home.title} />
        <Empty>
          {t.home.setupHint} <Link href="/settings/accounts/new" className="font-medium text-accent underline">{t.home.addAccount}</Link>
        </Empty>
      </>
    );
  }

  const spendMax = Math.max(1, ...spending.map((s) => s.total));

  return (
    <>
      <div className="mb-6">
        <QuickAdd
          today={now}
          accounts={accs.map((a) => ({ id: a.id, name: a.name, currency: a.currency }))}
          payees={payeeRows}
          categories={categoryRows}
        />
      </div>

      {(counts.overdueBills > 0 || counts.lateIncome > 0) && (
        <div className="mb-6 flex flex-wrap gap-2">
          {counts.overdueBills > 0 && (
            <Link href="/bills" className="btn border-out/40 text-out">⚠ {fmt(t.home.overdueBills, { n: counts.overdueBills })}</Link>
          )}
          {counts.lateIncome > 0 && (
            <Link href="/collect" className="btn border-warn/40 text-warn">⏳ {fmt(t.home.lateIncome, { n: counts.lateIncome })}</Link>
          )}
        </div>
      )}

      <Section title={t.home.safeToSpend}>
        <div className="grid gap-3 sm:grid-cols-2">
          {safe.map((s) => (
            <div key={s.currency} className="card p-4">
              <p className={`num text-3xl font-semibold ${s.safe < 0 ? "text-out" : ""}`}>{formatMoney(s.safe, s.currency)}</p>
              <p className="mt-1 text-sm text-muted">
                {fmt(t.home.safeHint, { until: formatShortDate(s.until) })}: {formatMoney(s.current, s.currency)} − {formatMoney(s.billsBeforeIncome, s.currency)}
              </p>
              <p className="mt-1 text-xs text-muted">
                {s.nextIncome
                  ? fmt(t.home.nextIncome, { title: s.nextIncome.title, date: formatShortDate(s.nextIncome.date) })
                  : t.home.noIncome}
              </p>
            </div>
          ))}
        </div>
      </Section>

      <div className="grid gap-6 lg:grid-cols-2">
        <Section title={t.home.balances} aside={<Link href="/forecast" className="text-xs text-accent">{t.nav.forecast} →</Link>}>
          <ul className="card divide-y divide-border">
            {balances.perAccount.map((b) => (
              <li key={b.account.id} className="flex items-center justify-between px-4 py-2.5">
                <span>
                  {b.account.name}{" "}
                  <span className="text-xs text-muted">
                    {t.enums.accountType[b.account.type]} · {b.account.currency}
                  </span>
                </span>
                <Money amount={b.current} currency={b.account.currency} colored={b.current < 0} />
              </li>
            ))}
            {balances.totals.length > 1 || balances.perAccount.length > 1
              ? balances.totals.map((tot) => (
                  <li key={tot.currency} className="flex items-center justify-between bg-surface-2 px-4 py-2.5 font-medium">
                    <span>{t.common.total} {tot.currency}</span>
                    <Money amount={tot.current} currency={tot.currency} colored={tot.current < 0} />
                  </li>
                ))
              : null}
          </ul>
        </Section>

        <Section title={t.home.thisMonth}>
          <div className="card space-y-3 p-4">
            {month.summary.length === 0 && <p className="text-sm text-muted">{t.common.empty}</p>}
            {month.summary.map((m) => (
              <div key={m.currency} className="grid grid-cols-2 gap-3">
                <div>
                  <p className="label">{t.home.in} · {m.currency}</p>
                  <p className="num text-lg text-in">{formatMoney(m.inSettled, m.currency)}</p>
                  {m.inPlanned > 0 && <p className="text-xs text-muted">+{formatMoney(m.inPlanned, m.currency)} {t.home.planned}</p>}
                </div>
                <div>
                  <p className="label">{t.home.out} · {m.currency}</p>
                  <p className="num text-lg text-out">{formatMoney(m.outSettled, m.currency)}</p>
                  {m.outPlanned > 0 && <p className="text-xs text-muted">+{formatMoney(m.outPlanned, m.currency)} {t.home.planned}</p>}
                </div>
              </div>
            ))}
            {spending.length > 0 && (
              <div className="border-t border-border pt-3">
                <p className="label">{t.home.topSpending}</p>
                <ul className="space-y-1.5">
                  {spending.slice(0, 6).map((s) => (
                    <li key={`${s.currency}${s.category}`} className="text-sm">
                      <div className="flex justify-between gap-2">
                        <span>{s.category}</span>
                        <span className="num text-muted">{formatMoney(s.total, s.currency)}</span>
                      </div>
                      <div className="mt-0.5 h-1.5 rounded-full bg-surface-2">
                        <div className="h-1.5 rounded-full bg-out/60" style={{ width: `${(s.total / spendMax) * 100}%` }} />
                      </div>
                    </li>
                  ))}
                </ul>
              </div>
            )}
          </div>
        </Section>
      </div>

      <Section title={t.nav.transactions} aside={<LinkButton href="/transactions">{t.tx.listTitle} →</LinkButton>}>
        {recent.length ? (
          <TxList>
            {recent.map((r) => (
              <TxRow key={r.tx.id} row={r} actions={false} />
            ))}
          </TxList>
        ) : (
          <Empty />
        )}
      </Section>
    </>
  );
}
