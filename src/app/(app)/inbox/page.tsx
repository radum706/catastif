import Link from "next/link";
import { ActionForm, ConfirmButton, IntentButton, SubmitButton } from "@/components/forms";
import { Badge, Empty, Field, PageHeader, Section, WorkspaceBadge } from "@/components/ui";
import { minorToInput } from "@/lib/money";
import { captureAction, deleteInboxAction, inboxDraftAction, redraftAction, rejectInboxAction } from "@/server/actions/inbox";
import { inbox } from "@/server/api";
import { WORKSPACES } from "@/server/api/workspace";
import type { InboxItem } from "@/server/db/schema";
import { formOptions, type FormOptions } from "@/server/form-data";
import { llm } from "@/server/llm";
import type { TaskDraft, TransactionDraft } from "@/server/llm/types";
import { getWorkspace } from "@/server/workspace";
import { fmt, t } from "@/i18n";

export const metadata = { title: t.inbox.title };

type Opts = Record<"personal" | "work", FormOptions>;

function Grouped<T extends { id: number; name: string }>({
  opts,
  pick,
  label,
  value,
  name,
  none = true,
}: {
  opts: Opts;
  pick: (o: FormOptions) => T[];
  label: (x: T) => string;
  value: number | null | undefined;
  name: string;
  none?: boolean;
}) {
  return (
    <select name={name} defaultValue={value ?? ""} className="input">
      {none && <option value="">{t.common.none}</option>}
      {WORKSPACES.map((ws) => (
        <optgroup key={ws} label={t.enums.workspace[ws]}>
          {pick(opts[ws]).map((x) => (
            <option key={x.id} value={x.id}>{label(x)}</option>
          ))}
        </optgroup>
      ))}
    </select>
  );
}

function TaskFields({ d, opts }: { d: Partial<TaskDraft>; opts: Opts }) {
  return (
    <>
      <input type="hidden" name="kind" value="task" />
      <Field label={t.tasks.title_} className="sm:col-span-2">
        <input name="title" required defaultValue={d.title ?? ""} className="input" />
      </Field>
      <Field label={t.workspace.switch}>
        <select name="workspace" defaultValue={d.workspace ?? "personal"} className="input">
          {WORKSPACES.map((w) => (
            <option key={w} value={w}>{t.enums.workspace[w]}</option>
          ))}
        </select>
      </Field>
      <Field label={t.tasks.project}>
        <Grouped name="projectId" opts={opts} pick={(o) => o.projects} label={(p) => p.name} value={d.projectId} />
      </Field>
      <div className="grid grid-cols-[3fr_2fr] gap-2">
        <Field label={t.tasks.dueDate}>
          <input type="date" name="dueDate" defaultValue={d.dueDate ?? ""} className="input" />
        </Field>
        <Field label={t.tasks.dueTime}>
          <input type="time" name="dueTime" defaultValue={d.dueTime ?? ""} className="input" />
        </Field>
      </div>
      <Field label={t.tasks.priority}>
        <select name="priority" defaultValue={d.priority ?? "none"} className="input">
          {(["none", "low", "medium", "high"] as const).map((p) => (
            <option key={p} value={p}>{t.enums.priority[p]}</option>
          ))}
        </select>
      </Field>
      <Field label={t.tasks.tags}>
        <input name="tags" defaultValue={(d.tags ?? []).join(", ")} className="input" />
      </Field>
      <Field label={t.tasks.notes}>
        <input name="notes" defaultValue={d.notes ?? ""} className="input" />
      </Field>
    </>
  );
}

function TransactionFields({ d, opts }: { d: Partial<TransactionDraft>; opts: Opts }) {
  const cats = (o: FormOptions) => o.categories.filter((c) => !d.direction || c.kind === (d.direction === "in" ? "income" : "expense"));
  return (
    <>
      <input type="hidden" name="kind" value="transaction" />
      <input type="hidden" name="workspace" value={d.workspace ?? "personal"} />
      <Field label={t.tx.title} className="sm:col-span-2">
        <input name="title" required defaultValue={d.title ?? ""} className="input" />
      </Field>
      <Field label={t.tx.direction}>
        <select name="direction" defaultValue={d.direction ?? "out"} className="input">
          <option value="out">{t.enums.direction.out}</option>
          <option value="in">{t.enums.direction.in}</option>
        </select>
      </Field>
      <Field label={t.tx.amount}>
        <input name="amount" inputMode="decimal" defaultValue={d.amount ? minorToInput(d.amount) : ""} className="input num" />
      </Field>
      <Field label={t.tx.account}>
        <Grouped name="accountId" opts={opts} pick={(o) => o.accounts} label={(a) => `${a.name} · ${a.currency}`} value={d.accountId} />
      </Field>
      <Field label={t.tx.status}>
        <select name="status" defaultValue={d.status ?? "paid"} className="input">
          {(["upcoming", "invoiced", "paid", "received"] as const).map((s) => (
            <option key={s} value={s}>{t.enums.status[s]}</option>
          ))}
        </select>
      </Field>
      <Field label={t.tx.date}>
        <input type="date" name="date" required defaultValue={d.date ?? ""} className="input" />
      </Field>
      <Field label={t.tx.dueDate}>
        <input type="date" name="dueDate" defaultValue={d.dueDate ?? ""} className="input" />
      </Field>
      <Field label={t.tx.category}>
        <Grouped name="categoryId" opts={opts} pick={cats} label={(c) => c.name} value={d.categoryId} />
      </Field>
      <Field label={t.tx.payee}>
        <Grouped name="payeeId" opts={opts} pick={(o) => o.payees} label={(p) => p.name} value={d.payeeId} />
      </Field>
      <Field label={t.common.notes} className="sm:col-span-2">
        <input name="notes" defaultValue={d.notes ?? ""} className="input" />
      </Field>
    </>
  );
}

function PendingItem({ item, opts }: { item: InboxItem; opts: Opts }) {
  const draft = (item.draft ?? {}) as Record<string, unknown>;
  const ws = (draft.workspace as "personal" | "work" | undefined) ?? item.workspace;
  return (
    <li className="card p-4">
      <div className="mb-3 flex flex-wrap items-start justify-between gap-2">
        <blockquote className="min-w-0 flex-1 border-l-2 border-accent pl-3 text-sm italic">{item.rawText}</blockquote>
        <div className="flex flex-wrap items-center gap-1.5 text-xs text-muted">
          {ws && <WorkspaceBadge ws={ws} long />}
          <Badge>{fmt(t.inbox.from, { source: t.inbox.sources[item.source] })}</Badge>
          {item.extractor && <span>{fmt(t.inbox.by, { extractor: item.extractor })}</span>}
        </div>
      </div>
      {item.error && <p className="mb-3 rounded-lg bg-warn/10 px-3 py-2 text-xs text-warn">{item.error}</p>}
      <div className="mb-3 flex flex-wrap gap-1.5">
        {(["task", "transaction"] as const).map((k) => (
          <form key={k} action={redraftAction}>
            <input type="hidden" name="id" value={item.id} />
            <input type="hidden" name="kind" value={k} />
            <SubmitButton className={`btn btn-sm ${item.kind === k ? "border-accent text-accent" : ""}`}>
              {k === "task" ? t.inbox.asTask : t.inbox.asTransaction}
            </SubmitButton>
          </form>
        ))}
      </div>
      {item.kind === "unknown" ? (
        <p className="text-sm text-muted">{t.inbox.unknown}</p>
      ) : (
        <ActionForm action={inboxDraftAction} className="grid gap-3 sm:grid-cols-2">
          <input type="hidden" name="id" value={item.id} />
          {item.kind === "task" ? <TaskFields d={draft as Partial<TaskDraft>} opts={opts} /> : <TransactionFields d={draft as Partial<TransactionDraft>} opts={opts} />}
          <div className="flex flex-wrap justify-end gap-2 sm:col-span-2">
            <IntentButton value="save">{t.inbox.save}</IntentButton>
            <IntentButton value="approve" className="btn btn-primary">✓ {t.inbox.approve}</IntentButton>
          </div>
        </ActionForm>
      )}
      <form action={rejectInboxAction} className="mt-2 flex justify-end">
        <input type="hidden" name="id" value={item.id} />
        <SubmitButton className="btn btn-sm btn-danger">{t.inbox.reject}</SubmitButton>
      </form>
    </li>
  );
}

export default async function InboxPage() {
  const current = await getWorkspace();
  const [pending, handled, personal, work] = await Promise.all([
    inbox.listInbox({ status: ["pending"] }),
    inbox.listInbox({ status: ["approved", "rejected"], limit: 20 }),
    formOptions("personal"),
    formOptions("work"),
  ]);
  const opts: Opts = { personal, work };

  return (
    <>
      <PageHeader title={t.inbox.title} intro={t.inbox.intro} actions={<Badge tone="accent">{fmt(t.inbox.llm, { name: llm.providerName() })}</Badge>} />
      <ActionForm action={captureAction} resetOnSuccess className="card mb-6 grid gap-3 p-4 sm:grid-cols-[1fr_auto_auto] sm:items-end">
        <Field label={t.inbox.capture} hint={t.inbox.captureHint}>
          <textarea name="text" required rows={2} placeholder={t.inbox.capturePlaceholder} className="input" />
        </Field>
        <Field label={t.inbox.hint}>
          <select name="workspace" defaultValue={current} className="input">
            <option value="">{t.inbox.auto}</option>
            <option value="personal">{t.enums.workspace.personal}</option>
            <option value="work">{t.enums.workspace.work}</option>
          </select>
        </Field>
        <SubmitButton>{t.inbox.capture}</SubmitButton>
      </ActionForm>

      <Section title={`${t.inbox.pending} (${pending.length})`}>
        {pending.length ? (
          <ul className="space-y-3">
            {pending.map((item) => (
              <PendingItem key={item.id} item={item} opts={opts} />
            ))}
          </ul>
        ) : (
          <Empty>{t.inbox.empty}</Empty>
        )}
      </Section>

      {handled.length > 0 && (
        <details>
          <summary className="mb-2 cursor-pointer text-sm font-semibold uppercase tracking-wide text-muted">{t.inbox.handled}</summary>
          <ul className="card divide-y divide-border">
            {handled.map((i) => (
              <li key={i.id} className="flex items-center justify-between gap-2 px-4 py-2 text-sm">
                <span className="min-w-0 truncate">
                  <Badge tone={i.status === "approved" ? "good" : "neutral"}>{i.status === "approved" ? t.inbox.approved : t.inbox.rejected}</Badge>{" "}
                  {i.rawText}
                </span>
                <span className="flex shrink-0 gap-1">
                  {i.resultId && (
                    <Link href={i.resultType === "task" ? `/tasks/${i.resultId}` : `/money/transactions/${i.resultId}`} className="btn btn-sm">
                      {t.inbox.open}
                    </Link>
                  )}
                  <form action={deleteInboxAction}>
                    <input type="hidden" name="id" value={i.id} />
                    <ConfirmButton message={t.common.confirmDelete}>×</ConfirmButton>
                  </form>
                </span>
              </li>
            ))}
          </ul>
        </details>
      )}
    </>
  );
}
