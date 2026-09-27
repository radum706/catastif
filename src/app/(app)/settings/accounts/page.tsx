import Link from "next/link";
import { Badge, Empty, LinkButton, Money, PageHeader } from "@/components/ui";
import { today } from "@/lib/dates";
import { forecast } from "@/server/api";
import { t } from "@/i18n";

export const metadata = { title: t.settings.accounts };

export default async function AccountsPage() {
  const { perAccount } = await forecast.balanceAt({ date: today(), includeArchived: true });
  return (
    <>
      <PageHeader title={t.settings.accounts} actions={<LinkButton href="/settings/accounts/new" primary>+ {t.account.add}</LinkButton>} />
      {perAccount.length === 0 ? (
        <Empty />
      ) : (
        <ul className="card divide-y divide-border">
          {perAccount.map(({ account: a, current }) => (
            <li key={a.id}>
              <Link href={`/settings/accounts/${a.id}`} className="flex items-center justify-between gap-3 px-4 py-3 hover:bg-surface-2">
                <span>
                  <span className="font-medium">{a.name}</span>{" "}
                  <span className="text-xs text-muted">
                    {t.enums.accountType[a.type]} · {a.currency} · {t.enums.context[a.context]}
                  </span>{" "}
                  {a.archived && <Badge>{t.common.archived}</Badge>}
                </span>
                <Money amount={current} currency={a.currency} colored={current < 0} />
              </Link>
            </li>
          ))}
        </ul>
      )}
    </>
  );
}
