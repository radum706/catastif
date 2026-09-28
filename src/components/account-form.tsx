import Link from "next/link";
import { ActionForm, SubmitButton } from "@/components/forms";
import { Field } from "@/components/ui";
import { today } from "@/lib/dates";
import { minorToInput } from "@/lib/money";
import { saveAccountAction } from "@/server/actions/money";
import type { Account } from "@/server/db/schema";
import { t } from "@/i18n";

export function AccountForm({ account, workspace }: { account?: Account; workspace: "personal" | "work" }) {
  return (
    <ActionForm action={saveAccountAction} className="card grid gap-4 p-4 sm:grid-cols-2 sm:p-5">
      {account && <input type="hidden" name="id" value={account.id} />}
      <Field label={t.common.name}>
        <input name="name" required className="input" defaultValue={account?.name} placeholder="ING, Revolut, Cash…" />
      </Field>
      <Field label={t.account.type}>
        <select name="type" className="input" defaultValue={account?.type ?? "bank"}>
          {(["bank", "cash", "card", "other"] as const).map((v) => (
            <option key={v} value={v}>{t.enums.accountType[v]}</option>
          ))}
        </select>
      </Field>
      <Field label={t.account.currency} hint={account ? t.account.currencyFixed : undefined}>
        <select name="currency" className="input" defaultValue={account?.currency ?? "RON"} disabled={!!account}>
          <option value="RON">RON</option>
          <option value="EUR">EUR</option>
        </select>
      </Field>
      <Field label={t.workspace.switch} hint={t.account.workspaceHint}>
        <input className="input" value={t.enums.workspace[account?.workspace ?? workspace]} disabled />
      </Field>
      <Field label={t.account.openingBalance}>
        <input name="openingBalance" inputMode="decimal" className="input num" defaultValue={account ? minorToInput(account.openingBalance) : "0"} />
      </Field>
      <Field label={t.account.openingDate}>
        <input type="date" name="openingDate" className="input" defaultValue={account?.openingDate ?? today()} />
      </Field>
      <Field label={t.common.notes} className="sm:col-span-2">
        <textarea name="notes" rows={2} className="input" defaultValue={account?.notes ?? ""} />
      </Field>
      {account && (
        <label className="flex items-center gap-2 text-sm">
          <input type="checkbox" name="archived" defaultChecked={account.archived} /> {t.common.archived}
        </label>
      )}
      <div className="flex justify-end gap-2 sm:col-span-2">
        <Link href="/settings/accounts" className="btn">{t.common.cancel}</Link>
        <SubmitButton>{account ? t.common.save : t.common.create}</SubmitButton>
      </div>
    </ActionForm>
  );
}
