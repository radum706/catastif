"use client";

import Link from "next/link";
import { useState } from "react";
import { ActionForm, SubmitButton } from "@/components/forms";
import { Field } from "@/components/ui";
import { minorToInput, type CurrencyCode } from "@/lib/money";
import type { ActionState } from "@/server/actions/form";
import { t } from "@/i18n";

type Dir = "in" | "out";
type Status = "upcoming" | "invoiced" | "paid" | "received";

export type TxFormValues = {
  id?: number;
  title: string;
  direction: Dir;
  amount?: number;
  accountId?: number;
  status: Status;
  date: string;
  dueDate?: string | null;
  invoicedAt?: string | null;
  categoryId?: number | null;
  payeeId?: number | null;
  projectId?: number | null;
  taskId?: number | null;
  notes?: string | null;
};

type Option = { id: number; name: string };
type PayeeOption = Option & {
  defaultDirection: Dir | null;
  defaultCategoryId: number | null;
  defaultAccountId: number | null;
};

const STATUSES: Record<Dir, Status[]> = { out: ["upcoming", "paid"], in: ["upcoming", "invoiced", "received"] };

export function TransactionForm({
  action,
  initial,
  accounts,
  categories,
  payees,
  projects,
  returnTo,
  lockDirection,
  taskTitle,
}: {
  action: (s: ActionState, fd: FormData) => Promise<ActionState>;
  initial: TxFormValues;
  accounts: (Option & { currency: CurrencyCode })[];
  projects: Option[];
  /** Shown when the transaction is linked to a task. */
  taskTitle?: string | null;
  categories: (Option & { kind: "income" | "expense"; parentId: number | null })[];
  payees: PayeeOption[];
  returnTo: string;
  lockDirection?: boolean;
}) {
  const [direction, setDirection] = useState<Dir>(initial.direction);
  const [status, setStatus] = useState<Status>(initial.status);
  const [accountId, setAccountId] = useState(initial.accountId ?? accounts[0]?.id);
  const [categoryId, setCategoryId] = useState(initial.categoryId ?? "");
  const [payeeId, setPayeeId] = useState(initial.payeeId ?? "");
  const [title, setTitle] = useState(initial.title);

  const statuses = STATUSES[direction];
  const effectiveStatus = statuses.includes(status) ? status : statuses[0];
  const kind = direction === "in" ? "income" : "expense";
  const currency = accounts.find((a) => a.id === accountId)?.currency;
  const parents = new Map(categories.map((c) => [c.id, c.name]));

  function pickPayee(id: string) {
    setPayeeId(id ? Number(id) : "");
    const p = payees.find((x) => x.id === Number(id));
    if (!p) return;
    if (!initial.id) {
      if (p.defaultDirection && !lockDirection) setDirection(p.defaultDirection);
      if (p.defaultAccountId) setAccountId(p.defaultAccountId);
      if (!title) setTitle(p.name);
    }
    if (p.defaultCategoryId && !categoryId) setCategoryId(p.defaultCategoryId);
  }

  return (
    <ActionForm action={action} className="card space-y-4 p-4 sm:p-5">
      {initial.id && <input type="hidden" name="id" value={initial.id} />}
      <input type="hidden" name="returnTo" value={returnTo} />
      <input type="hidden" name="direction" value={direction} />
      {initial.taskId && <input type="hidden" name="taskId" value={initial.taskId} />}
      {taskTitle && (
        <p className="rounded-lg bg-accent/10 px-3 py-2 text-sm">
          ↳ {taskTitle}
        </p>
      )}

      <div className="grid grid-cols-2 gap-2" role="radiogroup" aria-label={t.tx.direction}>
        {(["out", "in"] as const).map((d) => (
          <button
            key={d}
            type="button"
            role="radio"
            aria-checked={direction === d}
            disabled={lockDirection && direction !== d}
            onClick={() => setDirection(d)}
            className={`btn ${direction === d ? (d === "in" ? "border-in bg-in/10 text-in" : "border-out bg-out/10 text-out") : ""}`}
          >
            {d === "in" ? "+ " : "− "}
            {t.enums.direction[d]}
          </button>
        ))}
      </div>

      <div className="grid gap-4 sm:grid-cols-[2fr_1fr]">
        <Field label={t.tx.title}>
          <input name="title" required className="input" value={title} onChange={(e) => setTitle(e.target.value)} placeholder={t.tx.titlePlaceholder} />
        </Field>
        <Field label={`${t.tx.amount}${currency ? ` (${currency})` : ""}`}>
          <input
            name="amount"
            required
            inputMode="decimal"
            className="input num"
            defaultValue={initial.amount ? minorToInput(initial.amount) : ""}
            placeholder="0.00"
          />
        </Field>
      </div>

      <div className="grid gap-4 sm:grid-cols-2">
        <Field label={t.tx.payee}>
          <select name="payeeId" className="input" value={payeeId} onChange={(e) => pickPayee(e.target.value)}>
            <option value="">{t.common.none}</option>
            {payees.map((p) => (
              <option key={p.id} value={p.id}>{p.name}</option>
            ))}
          </select>
        </Field>
        <Field label={t.tx.category}>
          <select name="categoryId" className="input" value={categoryId} onChange={(e) => setCategoryId(e.target.value ? Number(e.target.value) : "")}>
            <option value="">{t.common.none}</option>
            {categories
              .filter((c) => c.kind === kind)
              .map((c) => (
                <option key={c.id} value={c.id}>
                  {c.parentId ? `${parents.get(c.parentId)} › ${c.name}` : c.name}
                </option>
              ))}
          </select>
        </Field>
        <Field label={t.tx.account}>
          <select name="accountId" className="input" value={accountId} onChange={(e) => setAccountId(Number(e.target.value))}>
            {accounts.map((a) => (
              <option key={a.id} value={a.id}>
                {a.name} · {a.currency}
              </option>
            ))}
          </select>
        </Field>
        <Field label={t.tx.status}>
          <select name="status" className="input" value={effectiveStatus} onChange={(e) => setStatus(e.target.value as Status)}>
            {statuses.map((s) => (
              <option key={s} value={s}>{t.enums.status[s]}</option>
            ))}
          </select>
        </Field>
        <Field label={t.tx.date} hint={t.tx.dateHint}>
          <input type="date" name="date" required className="input" defaultValue={initial.date} />
        </Field>
        {direction === "out" ? (
          <Field label={`${t.tx.dueDate} (${t.common.optional})`}>
            <input type="date" name="dueDate" className="input" defaultValue={initial.dueDate ?? ""} />
          </Field>
        ) : effectiveStatus !== "upcoming" ? (
          <Field label={`${t.tx.invoicedAt} (${t.common.optional})`}>
            <input type="date" name="invoicedAt" className="input" defaultValue={initial.invoicedAt ?? ""} />
          </Field>
        ) : (
          <div />
        )}
        <Field label={t.tasks.project}>
          <select name="projectId" className="input" defaultValue={initial.projectId ?? ""}>
            <option value="">{t.tasks.noProject}</option>
            {projects.map((p) => (
              <option key={p.id} value={p.id}>{p.name}</option>
            ))}
          </select>
        </Field>
      </div>

      <Field label={t.common.notes}>
        <textarea name="notes" rows={2} className="input" defaultValue={initial.notes ?? ""} />
      </Field>

      <div className="flex justify-end gap-2">
        <Link href={returnTo} className="btn">{t.common.cancel}</Link>
        <SubmitButton>{initial.id ? t.common.save : t.common.create}</SubmitButton>
      </div>
    </ActionForm>
  );
}
