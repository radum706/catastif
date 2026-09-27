import Link from "next/link";
import type { ReactNode } from "react";
import { SubmitButton } from "@/components/forms";
import { ColorDot, WorkspaceBadge } from "@/components/ui";
import { addDays, formatShortDate, today } from "@/lib/dates";
import { toggleTaskAction } from "@/server/actions/tasks";
import type { TaskRow as Row } from "@/server/api/tasks";
import { fmt, t } from "@/i18n";

export function dueLabel(date: string, time?: string | null) {
  const now = today();
  const day =
    date === now ? t.tasks.due.today : date === addDays(now, 1) ? t.tasks.due.tomorrow : date === addDays(now, -1) ? t.tasks.due.yesterday : formatShortDate(date);
  return time ? `${day} ${time.slice(0, 5)}` : day;
}

export function DueChip({ date, time, done }: { date: string | null; time?: string | null; done?: boolean }) {
  if (!date) return null;
  const now = today();
  const tone = done ? "text-muted" : date < now ? "text-out font-medium" : date === now ? "text-warn font-medium" : "text-muted";
  return <span className={`whitespace-nowrap ${tone}`}>{dueLabel(date, time)}</span>;
}

const PRIORITY_COLOR = { high: "text-out", medium: "text-warn", low: "text-accent", none: "" } as const;

export function TaskCheck({ id, completed, size = "md" }: { id: number; completed: boolean; size?: "md" | "lg" }) {
  return (
    <form action={toggleTaskAction} className="shrink-0">
      <input type="hidden" name="id" value={id} />
      <input type="hidden" name="completed" value={String(!completed)} />
      <SubmitButton
        className={`flex items-center justify-center rounded-full border-2 transition-colors ${size === "lg" ? "h-7 w-7" : "h-5 w-5"} ${
          completed ? "border-in bg-in text-white" : "border-border text-transparent hover:border-in hover:text-in"
        }`}
      >
        <svg viewBox="0 0 24 24" className="h-3 w-3" fill="none" stroke="currentColor" strokeWidth="3.5" aria-hidden>
          <path d="M5 12l5 5 9-10" />
        </svg>
        <span className="sr-only">{completed ? t.tasks.reopen : t.tasks.complete}</span>
      </SubmitButton>
    </form>
  );
}

export function TaskRow({
  row,
  showProject = true,
  showWorkspace = false,
  extra,
}: {
  row: Row;
  showProject?: boolean;
  showWorkspace?: boolean;
  extra?: ReactNode;
}) {
  const { task } = row;
  return (
    <li className="flex items-start gap-3 px-4 py-2.5">
      <div className="pt-0.5">
        <TaskCheck id={task.id} completed={task.completed} />
      </div>
      <div className="min-w-0 flex-1">
        <div className="flex items-baseline justify-between gap-3">
          <Link href={`/tasks/${task.id}`} className={`truncate hover:underline ${task.completed ? "text-muted line-through" : ""}`}>
            {task.priority !== "none" && <span className={`mr-1 ${PRIORITY_COLOR[task.priority]}`} title={t.enums.priority[task.priority]}>⚑</span>}
            {task.title}
          </Link>
          <span className="shrink-0 text-xs">
            <DueChip date={task.dueDate} time={task.dueTime} done={task.completed} />
          </span>
        </div>
        <div className="mt-0.5 flex flex-wrap items-center gap-x-2 gap-y-1 text-xs text-muted">
          {showWorkspace && <WorkspaceBadge ws={task.workspace} />}
          {showProject && row.projectName && (
            <Link href={`/tasks/projects/${task.projectId}`} className="inline-flex items-center gap-1 hover:text-fg">
              <ColorDot color={row.projectColor} className="h-2 w-2" />
              {row.projectName}
              {row.sectionName && <span className="opacity-70">› {row.sectionName}</span>}
            </Link>
          )}
          {row.parentTitle && <span>↳ {row.parentTitle}</span>}
          {row.subtasks > 0 && <span>☑ {fmt(t.tasks.subtaskCount, { done: row.subtasksDone, total: row.subtasks })}</span>}
          {task.notes && <span title={t.tasks.notes}>≡</span>}
          {row.tags.map((tag) => (
            <span key={tag.id} className="rounded bg-surface-2 px-1.5 py-0.5">#{tag.name}</span>
          ))}
          {extra}
        </div>
      </div>
    </li>
  );
}

export function TaskList({ children }: { children: ReactNode }) {
  return <ul className="card divide-y divide-border overflow-hidden">{children}</ul>;
}
