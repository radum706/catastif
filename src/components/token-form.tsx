"use client";

import { useActionState, useState } from "react";
import { FormMessage, SubmitButton } from "@/components/forms";
import { Field } from "@/components/ui";
import type { ActionState } from "@/server/actions/form";
import { createTokenAction } from "@/server/actions/integrations";
import { t } from "@/i18n";

const SCOPES = ["read", "write", "inbox", "calendar"] as const;

export function TokenForm() {
  const [state, action] = useActionState<(NonNullable<ActionState> & { token?: string }) | null, FormData>(createTokenAction, null);
  const [copied, setCopied] = useState(false);
  return (
    <form action={action} className="card grid gap-3 p-4 sm:grid-cols-[1fr_1fr] lg:grid-cols-[1fr_2fr_1fr_auto] lg:items-end">
      <Field label={t.common.name}>
        <input name="name" required placeholder="n8n, iPhone shortcut…" className="input" />
      </Field>
      <fieldset>
        <legend className="label">{t.integrations.scopes}</legend>
        <div className="flex flex-wrap gap-x-4 gap-y-1 py-1.5 text-sm">
          {SCOPES.map((s) => (
            <label key={s} className="flex items-center gap-1.5" title={t.integrations.scopeHelp[s]}>
              <input type="checkbox" name="scopes" value={s} defaultChecked={s === "read"} /> {s}
            </label>
          ))}
        </div>
      </fieldset>
      <Field label={t.integrations.workspace}>
        <select name="workspace" className="input" defaultValue="">
          <option value="">{t.integrations.both}</option>
          <option value="personal">{t.enums.workspace.personal}</option>
          <option value="work">{t.enums.workspace.work}</option>
        </select>
      </Field>
      <SubmitButton>{t.integrations.create}</SubmitButton>
      {state?.token && (
        <div className="rounded-lg bg-warn/10 p-3 text-sm sm:col-span-2 lg:col-span-4">
          <p className="mb-2 font-medium text-warn">{t.integrations.tokenCreated}</p>
          <div className="flex gap-2">
            <code className="num flex-1 overflow-x-auto rounded bg-surface px-2 py-1.5">{state.token}</code>
            <button
              type="button"
              className="btn btn-sm"
              onClick={() => {
                navigator.clipboard?.writeText(state.token!);
                setCopied(true);
              }}
            >
              {copied ? t.integrations.copied : t.integrations.copy}
            </button>
          </div>
        </div>
      )}
      {state?.error && <FormMessage state={state} />}
    </form>
  );
}
