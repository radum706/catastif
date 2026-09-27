import { AccountForm } from "@/components/account-form";
import { PageHeader } from "@/components/ui";
import { t } from "@/i18n";

export const metadata = { title: t.account.newTitle };

export default function NewAccountPage() {
  return (
    <>
      <PageHeader title={t.account.newTitle} />
      <AccountForm />
    </>
  );
}
