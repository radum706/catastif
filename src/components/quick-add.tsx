"use client";

import { useActionState, useMemo, useRef, useState } from "react";
import { FormMessage, SubmitButton } from "@/components/forms";
import { formatMoney, type CurrencyCode } from "@/lib/money";
import { formatShortDate } from "@/lib/dates";
import { parseQuickAdd, type QuickAddCategory, type QuickAddPayee } from "@/lib/quick-add";
import type { ActionState } from "@/server/actions/form";
import { quickAddAction } from "@/server/actions/money";
import { t } from "@/i18n";

type Acc = { id: number; name: string; currency: CurrencyCode };

export function QuickAdd({
  accounts,
  payees,
  categories,
  today,
}: {
  accounts: Acc[];
  payees: QuickAddPayee[];
  categories: QuickAddCategory[];
  today: string;
}) {
  const [text, setText] = useState("");
  const [accountId, setAccountId] = useState<number | "">("");
  const inputRef = useRef<HTMLInputElement>(null);
  const [state, action] = useActionState(async (prev: ActionState, fd: FormData) => {
    const res = await quickAddAction(prev, fd);
    if (!res?.error) {
      setText("");
      inputRef.current?.focus();
    }
    return res;
  }, null);

  const parsed = useMemo(() => (text.trim() ? parseQuickAdd(text, { today, payees, categories }) : null), [text, today, payees, categories]);

  // Payee default account applies until you pick one yourself.
  const [touched, setTouched] = useState(false);
  const effectiveAccount = touched ? accountId : (parsed?.accountId ?? accountId ?? "");
  const account = accounts.find((a) => a.id === effectiveAccount) ?? accounts[0];

  const category = categories.find((c) => c.id === parsed?.categoryId)?.name;

  return (
    <form action={action} className="card p-4">
      <label htmlFor="quick-add" className="label">
        {t.quickAdd.label}
      </label>
      <div className="flex flex-col gap-2 sm:flex-row">
        <input
          id="quick-add"
          ref={inputRef}
          name="text"
          value={text}
          onChange={(e) => setText(e.target.value)}
          placeholder={t.quickAdd.placeholder}
          className="input flex-1"
          autoComplete="off"
          enterKeyHint="done"
        />
        <div className="flex gap-2">
          <select
            name="accountId"
            aria-label={t.quickAdd.account}
            className="input sm:w-40"
            value={account?.id ?? ""}
            onChange={(e) => {
              setTouched(true);
              setAccountId(Number(e.target.value));
            }}
          >
            {accounts.map((a) => (
              <option key={a.id} value={a.id}>
                {a.name} · {a.currency}
              </option>
            ))}
          </select>
          <SubmitButton>{t.quickAdd.add}</SubmitButton>
        </div>
      </div>
      {parsed ? (
        <p className="mt-2 flex flex-wrap items-center gap-x-2 text-sm">
          {parsed.amount && account ? (
            <span className={`num font-medium ${parsed.direction === "in" ? "text-in" : "text-out"}`}>
              {parsed.direction === "in" ? "+" : "−"}
              {formatMoney(parsed.amount, account.currency)}
            </span>
          ) : (
            <span className="text-warn">{t.quickAdd.noAmount}</span>
          )}
          <span className="font-medium">{parsed.title}</span>
          <span className="text-muted">
            · {formatShortDate(parsed.date)} · {t.enums.status[parsed.status]}
            {category && ` · ${category}`}
            {parsed.dueDate && ` · ${t.tx.dueDate.toLowerCase()} ${formatShortDate(parsed.dueDate)}`}
          </span>
        </p>
      ) : (
        <p className="mt-2 text-xs text-muted">{t.quickAdd.help}</p>
      )}
      <FormMessage state={state} />
    </form>
  );
}
