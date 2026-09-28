import { ActionForm, SubmitButton } from "@/components/forms";
import { Field } from "@/components/ui";
import { savePayeeAction } from "@/server/actions/money";
import type { Payee } from "@/server/db/schema";
import { t } from "@/i18n";

type Opts = {
  accounts: { id: number; name: string; currency: string }[];
  categories: { id: number; name: string; kind: "income" | "expense" }[];
};

export function PayeeForm({ payee, accounts, categories, reset }: Opts & { payee?: Payee; reset?: boolean }) {
  return (
    <ActionForm action={savePayeeAction} resetOnSuccess={reset} className="card grid gap-3 p-4 sm:grid-cols-3 sm:items-end">
      {payee && <input type="hidden" name="id" value={payee.id} />}
      <Field label={t.common.name}>
        <input name="name" required className="input" defaultValue={payee?.name} placeholder="Enel, Landlord, Acme…" />
      </Field>
      <Field label={t.payee.defaultDirection}>
        <select name="defaultDirection" className="input" defaultValue={payee?.defaultDirection ?? ""}>
          <option value="">{t.common.none}</option>
          <option value="out">{t.enums.direction.out}</option>
          <option value="in">{t.enums.direction.in}</option>
        </select>
      </Field>
      <Field label={t.payee.defaultCategory}>
        <select name="defaultCategoryId" className="input" defaultValue={payee?.defaultCategoryId ?? ""}>
          <option value="">{t.common.none}</option>
          {categories.map((c) => (
            <option key={c.id} value={c.id}>{c.name} ({t.enums.categoryKind[c.kind]})</option>
          ))}
        </select>
      </Field>
      <Field label={t.payee.defaultAccount}>
        <select name="defaultAccountId" className="input" defaultValue={payee?.defaultAccountId ?? ""}>
          <option value="">{t.common.none}</option>
          {accounts.map((a) => (
            <option key={a.id} value={a.id}>{a.name} · {a.currency}</option>
          ))}
        </select>
      </Field>
      <SubmitButton>{payee ? t.common.save : t.payee.add}</SubmitButton>
    </ActionForm>
  );
}
