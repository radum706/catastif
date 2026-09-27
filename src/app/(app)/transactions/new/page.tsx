import Link from "next/link";
import { TransactionForm } from "@/components/transaction-form";
import { Empty, PageHeader } from "@/components/ui";
import { today } from "@/lib/dates";
import { createTransactionAction } from "@/server/actions/money";
import { formOptions, param, safePath } from "@/server/form-data";
import { t } from "@/i18n";

export const metadata = { title: t.tx.newTitle };

export default async function NewTransactionPage({ searchParams }: PageProps<"/transactions/new">) {
  const sp = await searchParams;
  const opts = await formOptions();
  const direction = param(sp, "direction") === "in" ? "in" : "out";
  const status = param(sp, "status") === "upcoming" ? "upcoming" : direction === "in" ? "received" : "paid";
  const returnTo = safePath(param(sp, "returnTo"), "/transactions");

  return (
    <>
      <PageHeader title={t.tx.newTitle} actions={<Link href="/transfers/new" className="btn">⇄ {t.tx.newTransfer}</Link>} />
      {opts.accounts.length === 0 ? (
        <Empty>
          {t.home.setupHint} <Link href="/settings/accounts/new" className="text-accent underline">{t.home.addAccount}</Link>
        </Empty>
      ) : (
        <TransactionForm
          action={createTransactionAction}
          initial={{
            title: "",
            direction,
            status,
            date: today(),
            context: opts.accounts[0].context,
          }}
          returnTo={returnTo}
          {...opts}
        />
      )}
    </>
  );
}
