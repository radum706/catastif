import Link from "next/link";
import { PayeeForm } from "@/components/payee-form";
import { Badge, Empty, PageHeader, Section } from "@/components/ui";
import { payees } from "@/server/api";
import { formOptions } from "@/server/form-data";
import { getWorkspace } from "@/server/workspace";
import { fmt, t } from "@/i18n";

export const metadata = { title: t.settings.payees };

export default async function PayeesPage() {
  const ws = await getWorkspace();
  const [rows, opts] = await Promise.all([payees.listPayees({ workspace: ws, includeArchived: true }), formOptions(ws)]);
  const cat = new Map(opts.categories.map((c) => [c.id, c.name]));
  const acc = new Map(opts.accounts.map((a) => [a.id, a.name]));
  return (
    <>
      <PageHeader title={t.settings.payees} intro={`${t.settings.payeesHint} · ${fmt(t.settings.inWorkspace, { ws: t.enums.workspace[ws] })}`} />
      <div className="mb-6">
        <PayeeForm reset accounts={opts.accounts} categories={opts.categories} />
      </div>
      <Section>
        {rows.length === 0 ? (
          <Empty />
        ) : (
          <ul className="card divide-y divide-border">
            {rows.map((p) => (
              <li key={p.id}>
                <Link href={`/settings/payees/${p.id}`} className="flex flex-wrap items-center justify-between gap-2 px-4 py-2.5 hover:bg-surface-2">
                  <span className="font-medium">{p.name}</span>
                  <span className="flex flex-wrap gap-1.5 text-xs text-muted">
                    {p.defaultDirection && <Badge tone={p.defaultDirection === "in" ? "good" : "danger"}>{t.enums.direction[p.defaultDirection]}</Badge>}
                    {p.defaultCategoryId && <Badge>{cat.get(p.defaultCategoryId)}</Badge>}
                    {p.defaultAccountId && <Badge>{acc.get(p.defaultAccountId)}</Badge>}
                    {p.archived && <Badge>{t.common.archived}</Badge>}
                  </span>
                </Link>
              </li>
            ))}
          </ul>
        )}
      </Section>
    </>
  );
}
