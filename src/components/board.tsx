"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useOptimistic, useState, useTransition } from "react";
import { TaskQuickAdd } from "@/components/task-quick-add";
import { addDays } from "@/lib/dates";
import { deleteSectionAction, moveTaskAction, renameSectionAction } from "@/server/actions/tasks";
import { fmt, t } from "@/i18n";

export type BoardTask = {
  id: number;
  title: string;
  sectionId: number | null;
  position: number;
  dueDate: string | null;
  dueTime: string | null;
  priority: "none" | "low" | "medium" | "high";
  completed: boolean;
  tags: { id: number; name: string }[];
  subtasks: number;
  subtasksDone: number;
};

type Column = { id: number | null; name: string };

const PRIORITY = { high: "text-out", medium: "text-warn", low: "text-accent", none: "" } as const;

function due(date: string, today: string) {
  if (date === today) return t.tasks.due.today;
  if (date === addDays(today, 1)) return t.tasks.due.tomorrow;
  return new Intl.DateTimeFormat("en-GB", { day: "numeric", month: "short", timeZone: "UTC" }).format(new Date(`${date}T00:00:00Z`));
}

export function Board({
  projectId,
  sections,
  tasks,
  today,
}: {
  projectId: number;
  sections: Column[];
  tasks: BoardTask[];
  today: string;
}) {
  const router = useRouter();
  const [, start] = useTransition();
  const [dragId, setDragId] = useState<number | null>(null);
  const [overCol, setOverCol] = useState<number | null | "none">("none");
  const [optimistic, apply] = useOptimistic(tasks, (state, m: { id: number; sectionId: number | null; position: number }) =>
    state.map((x) => (x.id === m.id ? { ...x, sectionId: m.sectionId, position: m.position } : x)),
  );

  const hasLoose = optimistic.some((x) => x.sectionId === null);
  const columns: Column[] = [...(hasLoose ? [{ id: null, name: t.tasks.noSection }] : []), ...sections];
  const inColumn = (id: number | null) => optimistic.filter((x) => x.sectionId === id).sort((a, b) => a.position - b.position);

  function moveTo(taskId: number, sectionId: number | null, index: number) {
    const col = inColumn(sectionId).filter((x) => x.id !== taskId);
    const after = col[index - 1] ?? null;
    const before = col[index] ?? null;
    const position =
      after && before ? (after.position + before.position) / 2 : after ? after.position + 1 : before ? before.position - 1 : 1;
    start(async () => {
      apply({ id: taskId, sectionId, position });
      await moveTaskAction({ id: taskId, sectionId, afterId: after?.id ?? null, beforeId: before?.id ?? null });
      router.refresh();
    });
  }

  function dropIndex(e: React.DragEvent, colEl: HTMLElement) {
    const cards = [...colEl.querySelectorAll<HTMLElement>("[data-card]")].filter((c) => Number(c.dataset.card) !== dragId);
    const idx = cards.findIndex((c) => e.clientY < c.getBoundingClientRect().top + c.offsetHeight / 2);
    return idx === -1 ? cards.length : idx;
  }

  async function rename(id: number, current: string) {
    const name = prompt(t.projects.sectionName, current)?.trim();
    if (!name || name === current) return;
    const fd = new FormData();
    fd.set("id", String(id));
    fd.set("name", name);
    await renameSectionAction(null, fd);
    router.refresh();
  }

  async function remove(id: number) {
    if (!confirm(t.projects.deleteSectionConfirm)) return;
    const fd = new FormData();
    fd.set("id", String(id));
    await deleteSectionAction(fd);
    router.refresh();
  }

  return (
    <div className="-mx-4 overflow-x-auto px-4 pb-4">
      <div className="flex items-start gap-3">
        {columns.map((col) => {
          const list = inColumn(col.id);
          return (
            <section
              key={col.id ?? "none"}
              className={`w-72 shrink-0 rounded-xl border border-border bg-surface-2/60 p-2 ${overCol === col.id && dragId ? "ring-2 ring-accent/50" : ""}`}
              onDragOver={(e) => {
                if (dragId === null) return;
                e.preventDefault();
                setOverCol(col.id);
              }}
              onDrop={(e) => {
                e.preventDefault();
                const id = Number(e.dataTransfer.getData("text/plain"));
                if (id) moveTo(id, col.id, dropIndex(e, e.currentTarget));
                setDragId(null);
                setOverCol("none");
              }}
            >
              <header className="mb-2 flex items-center justify-between gap-2 px-1">
                <h3 className="truncate text-sm font-semibold">
                  {col.name} <span className="font-normal text-muted">{list.filter((x) => !x.completed).length}</span>
                </h3>
                {col.id !== null && (
                  <span className="flex gap-1">
                    <button type="button" className="btn btn-sm px-1.5" onClick={() => rename(col.id!, col.name)} aria-label={t.projects.renameSection}>✎</button>
                    <button type="button" className="btn btn-sm btn-danger px-1.5" onClick={() => remove(col.id!)} aria-label={t.projects.deleteSection}>×</button>
                  </span>
                )}
              </header>
              <ul className="min-h-8 space-y-2">
                {list.map((task) => (
                  <li
                    key={task.id}
                    data-card={task.id}
                    draggable
                    onDragStart={(e) => {
                      e.dataTransfer.setData("text/plain", String(task.id));
                      e.dataTransfer.effectAllowed = "move";
                      setDragId(task.id);
                    }}
                    onDragEnd={() => setDragId(null)}
                    className={`card cursor-grab p-2.5 text-sm shadow-sm active:cursor-grabbing ${dragId === task.id ? "opacity-40" : ""}`}
                  >
                    <Link href={`/tasks/${task.id}`} className={`block hover:underline ${task.completed ? "text-muted line-through" : ""}`}>
                      {task.priority !== "none" && <span className={`mr-1 ${PRIORITY[task.priority]}`}>⚑</span>}
                      {task.completed && "✓ "}
                      {task.title}
                    </Link>
                    <div className="mt-1.5 flex flex-wrap items-center gap-x-2 gap-y-1 text-xs text-muted">
                      {task.dueDate && (
                        <span className={!task.completed && task.dueDate < today ? "text-out" : task.dueDate === today ? "text-warn" : ""}>
                          📅 {due(task.dueDate, today)}
                          {task.dueTime && ` ${task.dueTime.slice(0, 5)}`}
                        </span>
                      )}
                      {task.subtasks > 0 && <span>☑ {fmt(t.tasks.subtaskCount, { done: task.subtasksDone, total: task.subtasks })}</span>}
                      {task.tags.map((tag) => (
                        <span key={tag.id}>#{tag.name}</span>
                      ))}
                      {/* Touch devices can't drag: pick the column instead. */}
                      <select
                        aria-label={t.tasks.section}
                        className="ml-auto rounded border border-border bg-surface px-1 text-[11px] md:hidden"
                        value={task.sectionId ?? ""}
                        onChange={(e) => moveTo(task.id, e.target.value ? Number(e.target.value) : null, 0)}
                      >
                        {hasLoose && <option value="">{t.tasks.noSection}</option>}
                        {sections.map((s) => (
                          <option key={s.id} value={s.id!}>{s.name}</option>
                        ))}
                      </select>
                    </div>
                  </li>
                ))}
              </ul>
              <div className="mt-2">
                <TaskQuickAdd today={today} projectId={projectId} sectionId={col.id} compact placeholder={`+ ${t.projects.addTask}`} />
              </div>
            </section>
          );
        })}
      </div>
    </div>
  );
}
