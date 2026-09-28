import Link from "next/link";
import { notFound } from "next/navigation";
import { Board } from "@/components/board";
import { CalendarGrid } from "@/components/calendar-grid";
import { Agenda } from "@/components/agenda";
import { ActionForm, ConfirmButton, SubmitButton } from "@/components/forms";
import { TaskList, TaskRow } from "@/components/task-row";
import { TaskQuickAdd } from "@/components/task-quick-add";
import { Badge, ColorDot, Field, Money, Section, WorkspaceBadge } from "@/components/ui";
import { gridDays, shiftAnchor } from "@/lib/calendar-grid";
import { formatShortDate, isISODate, today } from "@/lib/dates";
import {
  createSectionAction,
  deleteProjectAction,
  deleteSectionAction,
  renameSectionAction,
  updateProjectAction,
} from "@/server/actions/tasks";
import { calendar, projects, tasks } from "@/server/api";
import { ApiError } from "@/server/api/errors";
import { PROJECT_COLORS } from "@/server/api/projects";
import type { TaskRow as Row } from "@/server/api/tasks";
import { param } from "@/server/form-data";
import { fmt, t } from "@/i18n";

const VIEWS = ["list", "board", "calendar"] as const;
type View = (typeof VIEWS)[number];

export default async function ProjectPage({ params, searchParams }: PageProps<"/tasks/projects/[id]">) {
  const [{ id }, sp] = await Promise.all([params, searchParams]);
  const project = await projects.getProject(Number(id)).catch((e) => {
    if (e instanceof ApiError || Number.isNaN(Number(id))) notFound();
    throw e;
  });
  const now = today();
  const view: View = VIEWS.includes(param(sp, "view") as View) ? (param(sp, "view") as View) : project.sections.length > 1 ? "board" : "list";
  const showDone = param(sp, "done") === "1";
  const [rows, money] = await Promise.all([
    tasks.listTasks({ projectId: project.id, parentId: "top", completed: showDone ? undefined : false }),
    projects.projectMoney(project.id),
  ]);
  const base = `/tasks/projects/${project.id}`;
  const q = (over: { view?: View; done?: boolean }) => {
    const done = over.done ?? showDone;
    return `${base}?${new URLSearchParams({ view: over.view ?? view, ...(done ? { done: "1" } : {}) })}`;
  };

  return (
    <>
      <div className="mb-4 flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0">
          <h1 className="flex items-center gap-2 text-2xl font-semibold tracking-tight">
            <ColorDot color={project.color} className="h-3.5 w-3.5" />
            <span className="truncate">{project.name}</span>
          </h1>
          <p className="mt-1 flex flex-wrap items-center gap-2 text-sm text-muted">
            <WorkspaceBadge ws={project.workspace} long />
            <Badge>{t.enums.projectStatus[project.status]}</Badge>
            {project.dueDate && <span>⚑ {formatShortDate(project.dueDate)}</span>}
            {project.description && <span>· {project.description}</span>}
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <div className="flex rounded-lg border border-border bg-surface p-0.5">
            {VIEWS.map((v) => (
              <Link key={v} href={q({ view: v })} className={`rounded-md px-2.5 py-1 text-sm ${view === v ? "bg-surface-2 font-medium" : "text-muted hover:text-fg"}`}>
                {t.projects.views[v]}
              </Link>
            ))}
          </div>
          {view !== "calendar" && (
            <Link href={q({ done: !showDone })} className="btn btn-sm">
              {showDone ? "✓ " : ""}
              {t.tasks.completed}
            </Link>
          )}
        </div>
      </div>

      {money.length > 0 && (
        <div className="card mb-5 flex flex-wrap gap-x-6 gap-y-2 p-3 text-sm">
          <span className="label mb-0 self-center">{t.projects.money}</span>
          {money.map((m) => (
            <span key={m.currency} className="flex flex-wrap gap-x-4">
              <span>
                {t.projects.costs}: <Money amount={m.costPaid} currency={m.currency} colored={false} />
                {m.costPlanned > 0 && <span className="text-muted"> + <Money amount={m.costPlanned} currency={m.currency} colored={false} /> {t.projects.planned}</span>}
              </span>
              <span>
                {t.projects.income}: <Money amount={m.incomeReceived} currency={m.currency} colored={false} />
                {m.incomePlanned > 0 && <span className="text-muted"> + <Money amount={m.incomePlanned} currency={m.currency} colored={false} /> {t.projects.planned}</span>}
              </span>
            </span>
          ))}
        </div>
      )}

      {view === "board" && (
        <Board
          projectId={project.id}
          today={now}
          sections={project.sections.map((s) => ({ id: s.id, name: s.name }))}
          tasks={rows.map((r) => ({
            id: r.task.id,
            title: r.task.title,
            sectionId: r.task.sectionId,
            position: r.task.position,
            dueDate: r.task.dueDate,
            dueTime: r.task.dueTime,
            priority: r.task.priority,
            completed: r.task.completed,
            tags: r.tags,
            subtasks: r.subtasks,
            subtasksDone: r.subtasksDone,
          }))}
        />
      )}

      {view === "list" && <ListView projectId={project.id} sections={project.sections} rows={rows} today={now} />}

      {view === "calendar" && <ProjectCalendar projectId={project.id} anchorParam={param(sp, "date")} base={base} today={now} />}

      {view !== "calendar" && (
        <ActionForm action={createSectionAction} resetOnSuccess className="mt-4 flex max-w-md gap-2">
          <input type="hidden" name="projectId" value={project.id} />
          <input name="name" required placeholder={t.projects.sectionName} className="input" />
          <SubmitButton className="btn whitespace-nowrap">+ {t.projects.addSection}</SubmitButton>
        </ActionForm>
      )}

      <details className="mt-8">
        <summary className="cursor-pointer text-sm font-medium text-muted">{t.projects.edit}</summary>
        <ActionForm action={updateProjectAction} className="card mt-3 grid gap-3 p-4 sm:grid-cols-2 lg:grid-cols-3">
          <input type="hidden" name="id" value={project.id} />
          <Field label={t.projects.name}>
            <input name="name" required defaultValue={project.name} className="input" />
          </Field>
          <Field label={t.projects.status}>
            <select name="status" defaultValue={project.status} className="input">
              {(["active", "on_hold", "done", "archived"] as const).map((s) => (
                <option key={s} value={s}>{t.enums.projectStatus[s]}</option>
              ))}
            </select>
          </Field>
          <Field label={t.projects.color}>
            <select name="color" defaultValue={project.color} className="input">
              {PROJECT_COLORS.map((c) => (
                <option key={c} value={c}>{c}</option>
              ))}
            </select>
          </Field>
          <Field label={t.tasks.startDate}>
            <input type="date" name="startDate" defaultValue={project.startDate ?? ""} className="input" />
          </Field>
          <Field label={t.tasks.dueDate}>
            <input type="date" name="dueDate" defaultValue={project.dueDate ?? ""} className="input" />
          </Field>
          <Field label={t.projects.description}>
            <input name="description" defaultValue={project.description ?? ""} className="input" />
          </Field>
          <div className="flex justify-end sm:col-span-2 lg:col-span-3">
            <SubmitButton>{t.common.save}</SubmitButton>
          </div>
        </ActionForm>
        <form action={deleteProjectAction} className="mt-3 flex justify-end">
          <input type="hidden" name="id" value={project.id} />
          <ConfirmButton message={t.projects.deleteConfirm} className="btn btn-danger">{t.common.delete}</ConfirmButton>
        </form>
      </details>
    </>
  );
}

function ListView({
  projectId,
  sections,
  rows,
  today: now,
}: {
  projectId: number;
  sections: { id: number; name: string }[];
  rows: Row[];
  today: string;
}) {
  const loose = rows.filter((r) => !r.task.sectionId).sort((a, b) => a.task.position - b.task.position);
  const bySection = (id: number) => rows.filter((r) => r.task.sectionId === id).sort((a, b) => a.task.position - b.task.position);
  return (
    <>
      {(loose.length > 0 || sections.length === 0) && (
        <Section>
          {loose.length > 0 && (
            <TaskList>
              {loose.map((r) => (
                <TaskRow key={r.task.id} row={r} showProject={false} />
              ))}
            </TaskList>
          )}
          <div className="mt-2">
            <TaskQuickAdd today={now} projectId={projectId} compact placeholder={`+ ${t.projects.addTask}`} />
          </div>
        </Section>
      )}
      {sections.map((s) => {
        const list = bySection(s.id);
        return (
          <Section
            key={s.id}
            title={`${s.name} (${list.length})`}
            aside={
              <span className="flex gap-1">
                <details className="relative">
                  <summary className="btn btn-sm list-none px-1.5">✎</summary>
                  <ActionForm action={renameSectionAction} className="card absolute right-0 z-10 mt-1 flex w-64 gap-2 p-2">
                    <input type="hidden" name="id" value={s.id} />
                    <input name="name" defaultValue={s.name} className="input py-1" aria-label={t.projects.sectionName} />
                    <SubmitButton className="btn btn-sm">{t.common.save}</SubmitButton>
                  </ActionForm>
                </details>
                <form action={deleteSectionAction}>
                  <input type="hidden" name="id" value={s.id} />
                  <ConfirmButton message={t.projects.deleteSectionConfirm} className="btn btn-sm btn-danger px-1.5">×</ConfirmButton>
                </form>
              </span>
            }
          >
            {list.length > 0 && (
              <TaskList>
                {list.map((r) => (
                  <TaskRow key={r.task.id} row={r} showProject={false} />
                ))}
              </TaskList>
            )}
            <div className="mt-2">
              <TaskQuickAdd today={now} projectId={projectId} sectionId={s.id} compact placeholder={`+ ${t.projects.addTask}`} />
            </div>
          </Section>
        );
      })}
    </>
  );
}

async function ProjectCalendar({ projectId, anchorParam, base, today: now }: { projectId: number; anchorParam?: string; base: string; today: string }) {
  const anchor = anchorParam && isISODate(anchorParam) ? anchorParam : now;
  const days = gridDays(anchor, "month");
  const items = await calendar.calendarItems({ from: days[0], to: days[days.length - 1], projectId });
  const link = (d: string) => `${base}?view=calendar&date=${d}`;
  const title = new Intl.DateTimeFormat("en-GB", { month: "long", year: "numeric", timeZone: "UTC" }).format(new Date(`${anchor}T00:00:00Z`));
  return (
    <>
      <div className="mb-3 flex items-center gap-2">
        <Link href={link(shiftAnchor(anchor, "month", -1))} className="btn btn-sm">←</Link>
        <Link href={link(now)} className="btn btn-sm">{t.calendar.today}</Link>
        <Link href={link(shiftAnchor(anchor, "month", 1))} className="btn btn-sm">→</Link>
        <span className="ml-2 font-medium">{title}</span>
      </div>
      <div className="hidden md:block">
        <CalendarGrid days={days} items={items} today={now} month={anchor.slice(0, 7)} view="month" showWorkspace={false} />
      </div>
      <div className="md:hidden">
        <Agenda items={items.filter((i) => i.date.startsWith(anchor.slice(0, 7)))} showWorkspace={false} />
      </div>
      <p className="mt-2 text-xs text-muted">{fmt(t.projects.progress, { done: items.filter((i) => i.done).length, total: items.filter((i) => i.kind === "task").length })}</p>
    </>
  );
}
