import Link from "next/link";
import { notFound } from "next/navigation";
import { ConfirmButton } from "@/components/forms";
import { PayeeForm } from "@/components/payee-form";
import { PageHeader } from "@/components/ui";
import { deletePayeeAction } from "@/server/actions/money";
import { payees } from "@/server/api";
import { formOptions } from "@/server/form-data";
import { t } from "@/i18n";

export default async function EditPayeePage({ params }: PageProps<"/settings/payees/[id]">) {
  const { id } = await params;
  const [rows, opts] = await Promise.all([payees.listPayees({ includeArchived: true }), formOptions()]);
  const payee = rows.find((p) => p.id === Number(id));
  if (!payee) notFound();
  return (
    <>
      <PageHeader title={payee.name} actions={<Link href={`/transactions?payee=${payee.id}`} className="btn">{t.nav.transactions} →</Link>} />
      <PayeeForm payee={payee} accounts={opts.accounts} categories={opts.categories} />
      <form action={deletePayeeAction} className="mt-4 flex justify-end">
        <input type="hidden" name="id" value={payee.id} />
        <ConfirmButton message={t.common.confirmDelete} className="btn btn-danger">{t.common.delete}</ConfirmButton>
      </form>
    </>
  );
}
