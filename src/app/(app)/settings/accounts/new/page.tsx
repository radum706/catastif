import { AccountForm } from "@/components/account-form";
import { PageHeader } from "@/components/ui";
import { getWorkspace } from "@/server/workspace";
import { t } from "@/i18n";

export const metadata = { title: t.account.newTitle };

export default async function NewAccountPage() {
  const ws = await getWorkspace();
  return (
    <>
      <PageHeader title={`${t.account.newTitle} · ${t.enums.workspace[ws]}`} />
      <AccountForm workspace={ws} />
    </>
  );
}
