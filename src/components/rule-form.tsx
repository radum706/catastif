import Link from "next/link";
import { ActionForm, SubmitButton } from "@/components/forms";
import { Field } from "@/components/ui";
import { today } from "@/lib/dates";
import { minorToInput } from "@/lib/money";
import { saveRuleAction } from "@/server/actions/money";
import type { RecurringRule } from "@/server/db/schema";
import type { formOptions } from "@/server/form-data";
import { t } from "@/i18n";

type Opts = Awaited<ReturnType<typeof formOptions>>;

export function RuleForm({ rule, accounts, categories, payees }: Opts & { rule?: RecurringRule }) {
  return (
    <ActionForm action={saveRuleAction} className="card grid gap-4 p-4 sm:grid-cols-2 sm:p-5">
      {rule && <input type="hidden" name="id" value={rule.id} />}
      {rule && <p className="rounded-lg bg-warn/10 px-3 py-2 text-sm text-warn sm:col-span-2">{t.rule.editWarning}</p>}
      <Field label={t.tx.title}>
        <input name="title" required className="input" defaultValue={rule?.title} placeholder="Salary, Rent, Netflix…" />
      </Field>
      <Field label={t.tx.direction}>
        <select name="direction" className="input" defaultValue={rule?.direction ?? "out"}>
          <option value="out">{t.enums.direction.out}</option>
          <option value="in">{t.enums.direction.in}</option>
        </select>
      </Field>
      <Field label={t.tx.amount}>
        <input name="amount" required inputMode="decimal" className="input num" defaultValue={rule ? minorToInput(rule.amount) : ""} />
      </Field>
      <Field label={t.tx.account}>
        <select name="accountId" className="input" defaultValue={rule?.accountId}>
          {accounts.map((a) => (
            <option key={a.id} value={a.id}>{a.name} · {a.currency}</option>
          ))}
        </select>
      </Field>
      <Field label={t.tx.category}>
        <select name="categoryId" className="input" defaultValue={rule?.categoryId ?? ""}>
          <option value="">{t.common.none}</option>
          {categories.map((c) => (
            <option key={c.id} value={c.id}>{c.name} ({t.enums.categoryKind[c.kind]})</option>
          ))}
        </select>
      </Field>
      <Field label={t.tx.payee}>
        <select name="payeeId" className="input" defaultValue={rule?.payeeId ?? ""}>
          <option value="">{t.common.none}</option>
          {payees.map((p) => (
            <option key={p.id} value={p.id}>{p.name}</option>
          ))}
        </select>
      </Field>
      <div className="grid grid-cols-[1fr_2fr] gap-2">
        <Field label={t.rule.every}>
          <input type="number" name="interval" min={1} max={366} className="input" defaultValue={rule?.interval ?? 1} />
        </Field>
        <Field label={t.rule.frequency}>
          <select name="frequency" className="input" defaultValue={rule?.frequency ?? "monthly"}>
            {(["monthly", "weekly", "yearly", "daily"] as const).map((f) => (
              <option key={f} value={f}>{t.enums.frequencyUnit[f]}</option>
            ))}
          </select>
        </Field>
      </div>
      <Field label={t.rule.startDate}>
        <input type="date" name="startDate" required className="input" defaultValue={rule?.startDate ?? today()} />
      </Field>
      <Field label={`${t.rule.endDate} (${t.common.optional})`}>
        <input type="date" name="endDate" className="input" defaultValue={rule?.endDate ?? ""} />
      </Field>
      <Field label={`${t.rule.dueOffset} (${t.common.optional})`} hint={t.rule.dueOffsetHint}>
        <input type="number" name="dueOffsetDays" min={0} max={365} className="input" defaultValue={rule?.dueOffsetDays ?? ""} />
      </Field>
      <label className="flex items-center gap-2 self-center text-sm">
        <input type="checkbox" name="active" defaultChecked={rule?.active ?? true} /> {t.rule.active}
      </label>
      <Field label={t.common.notes} className="sm:col-span-2">
        <textarea name="notes" rows={2} className="input" defaultValue={rule?.notes ?? ""} />
      </Field>
      <div className="flex justify-end gap-2 sm:col-span-2">
        <Link href="/settings/recurring" className="btn">{t.common.cancel}</Link>
        <SubmitButton>{rule ? t.common.save : t.common.create}</SubmitButton>
      </div>
    </ActionForm>
  );
}
