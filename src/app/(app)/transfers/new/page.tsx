import { ActionForm, SubmitButton } from "@/components/forms";
import { Field, PageHeader } from "@/components/ui";
import { today } from "@/lib/dates";
import { createTransferAction } from "@/server/actions/money";
import { accounts } from "@/server/api";
import { t } from "@/i18n";

export const metadata = { title: t.transfer.title };

export default async function NewTransferPage() {
  const accs = await accounts.listAccounts();
  const options = accs.map((a) => (
    <option key={a.id} value={a.id}>
      {a.name} · {a.currency}
    </option>
  ));
  return (
    <>
      <PageHeader title={t.transfer.title} />
      <ActionForm action={createTransferAction} className="card grid gap-4 p-4 sm:grid-cols-2 sm:p-5">
        <Field label={t.transfer.from}>
          <select name="fromAccountId" className="input" defaultValue={accs[0]?.id}>{options}</select>
        </Field>
        <Field label={t.transfer.to}>
          <select name="toAccountId" className="input" defaultValue={accs[1]?.id}>{options}</select>
        </Field>
        <Field label={t.transfer.amount}>
          <input name="amount" required inputMode="decimal" className="input num" placeholder="0.00" />
        </Field>
        <Field label={`${t.transfer.amountIn} (${t.common.optional})`} hint={t.transfer.amountInHint}>
          <input name="amountIn" inputMode="decimal" className="input num" placeholder="0.00" />
        </Field>
        <Field label={t.transfer.date}>
          <input type="date" name="date" className="input" defaultValue={today()} />
        </Field>
        <Field label={t.transfer.note}>
          <input name="note" className="input" />
        </Field>
        <div className="flex justify-end gap-2 sm:col-span-2">
          <a href="/transactions" className="btn">{t.common.cancel}</a>
          <SubmitButton>{t.common.create}</SubmitButton>
        </div>
      </ActionForm>
    </>
  );
}
