import Link from "next/link";
import { Badge, Empty, LinkButton, Money, PageHeader } from "@/components/ui";
import { formatShortDate } from "@/lib/dates";
import { recurring } from "@/server/api";
import { fmt, t } from "@/i18n";

export const metadata = { title: t.settings.recurring };

export default async function RecurringPage() {
  const rules = await recurring.listRules();
  return (
    <>
      <PageHeader
        title={t.settings.recurring}
        intro={t.settings.recurringHint}
        actions={<LinkButton href="/settings/recurring/new" primary>+ {t.rule.add}</LinkButton>}
      />
      {rules.length === 0 ? (
        <Empty />
      ) : (
        <ul className="card divide-y divide-border">
          {rules.map(({ rule: r, accountName }) => (
            <li key={r.id}>
              <Link href={`/settings/recurring/${r.id}`} className="flex flex-wrap items-center justify-between gap-2 px-4 py-3 hover:bg-surface-2">
                <span>
                  <span className="font-medium">{r.title}</span>{" "}
                  <span className="text-xs text-muted">
                    · {t.rule.every.toLowerCase()} {r.interval > 1 ? `${r.interval} ` : ""}
                    {t.enums.frequencyUnit[r.frequency]} · {accountName}
                    {r.generatedUntil && ` · ${fmt(t.rule.generatedUntil, { date: formatShortDate(r.generatedUntil) })}`}
                  </span>{" "}
                  {!r.active && <Badge>{t.rule.inactive}</Badge>}
                </span>
                <Money amount={r.amount} currency={r.currency} direction={r.direction} />
              </Link>
            </li>
          ))}
        </ul>
      )}
    </>
  );
}
