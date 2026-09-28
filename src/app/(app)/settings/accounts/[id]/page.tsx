import Link from "next/link";
import { notFound } from "next/navigation";
import { AccountForm } from "@/components/account-form";
import { ActionForm, ConfirmButton } from "@/components/forms";
import { PageHeader } from "@/components/ui";
import { deleteAccountAction } from "@/server/actions/money";
import { accounts } from "@/server/api";
import { t } from "@/i18n";

export const metadata = { title: t.account.editTitle };

export default async function EditAccountPage({ params }: PageProps<"/settings/accounts/[id]">) {
  const { id } = await params;
  const account = await accounts.getAccount(Number(id)).catch(() => notFound());
  return (
    <>
      <PageHeader
        title={account.name}
        actions={<Link href={`/money/transactions?account=${account.id}`} className="btn">{t.nav.transactions} →</Link>}
      />
      <AccountForm account={account} workspace={account.workspace} />
      <ActionForm action={deleteAccountAction} className="mt-4 flex flex-col items-end">
        <input type="hidden" name="id" value={account.id} />
        <ConfirmButton message={t.common.confirmDelete} className="btn btn-danger">{t.common.delete}</ConfirmButton>
      </ActionForm>
    </>
  );
}
