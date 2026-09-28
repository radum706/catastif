"use client";

import { useActionState, useMemo, useRef, useState } from "react";
import { FormMessage, SubmitButton } from "@/components/forms";
import { formatShortDate } from "@/lib/dates";
import { parseTaskLine } from "@/lib/task-parse";
import type { ActionState } from "@/server/actions/form";
import { quickAddTaskAction } from "@/server/actions/tasks";
import { t } from "@/i18n";

export function TaskQuickAdd({
  today,
  projectId,
  sectionId,
  parentId,
  workspace,
  placeholder = t.tasks.quickAddPlaceholder,
  compact,
}: {
  today: string;
  projectId?: number;
  sectionId?: number | null;
  parentId?: number;
  workspace?: "personal" | "work";
  placeholder?: string;
  compact?: boolean;
}) {
  const [text, setText] = useState("");
  const ref = useRef<HTMLInputElement>(null);
  const [state, action] = useActionState(async (prev: ActionState, fd: FormData) => {
    const res = await quickAddTaskAction(prev, fd);
    if (!res?.error) {
      setText("");
      ref.current?.focus();
    }
    return res;
  }, null);
  const parsed = useMemo(() => (text.trim() ? parseTaskLine(text, today) : null), [text, today]);
  const hasExtras = parsed && (parsed.dueDate || parsed.priority !== "none" || parsed.tags.length);

  return (
    <form action={action} className={compact ? "" : "card p-3"}>
      {projectId && <input type="hidden" name="projectId" value={projectId} />}
      {sectionId && <input type="hidden" name="sectionId" value={sectionId} />}
      {parentId && <input type="hidden" name="parentId" value={parentId} />}
      {workspace && <input type="hidden" name="workspace" value={workspace} />}
      <div className="flex gap-2">
        <input
          ref={ref}
          name="text"
          value={text}
          onChange={(e) => setText(e.target.value)}
          placeholder={placeholder}
          aria-label={t.tasks.quickAdd}
          className={`input flex-1 ${compact ? "py-1.5" : ""}`}
          autoComplete="off"
          enterKeyHint="done"
        />
        <SubmitButton className={`btn btn-primary ${compact ? "btn-sm" : ""}`}>+</SubmitButton>
      </div>
      {hasExtras ? (
        <p className="mt-1.5 flex flex-wrap gap-x-2 text-xs text-muted">
          <span className="font-medium text-fg">{parsed.title || "…"}</span>
          {parsed.dueDate && <span>📅 {formatShortDate(parsed.dueDate)}{parsed.dueTime && ` ${parsed.dueTime}`}</span>}
          {parsed.priority !== "none" && <span>⚑ {t.enums.priority[parsed.priority]}</span>}
          {parsed.tags.map((tag) => (
            <span key={tag}>#{tag}</span>
          ))}
        </p>
      ) : (
        !compact && <p className="mt-1.5 text-xs text-muted">{t.tasks.quickAddHelp}</p>
      )}
      <FormMessage state={state} />
    </form>
  );
}
