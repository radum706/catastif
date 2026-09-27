import Link from "next/link";
import { ActionForm, SubmitButton } from "@/components/forms";
import { Badge, ColorDot, Empty, Field, PageHeader, Section } from "@/components/ui";
import { formatShortDate } from "@/lib/dates";
import { createProjectAction } from "@/server/actions/tasks";
import { projects } from "@/server/api";
import { PROJECT_COLORS } from "@/server/api/projects";
import { param } from "@/server/form-data";
import { getWorkspace } from "@/server/workspace";
import { fmt, t } from "@/i18n";

export const metadata = { title: t.projects.title };

export default async function ProjectsPage({ searchParams }: PageProps<"/tasks/projects">) {
  const sp = await searchParams;
  const ws = await getWorkspace();
  const showArchived = param(sp, "archived") === "1";
  const rows = await projects.listProjects({ workspace: ws, includeArchived: showArchived });

  return (
    <>
      <PageHeader
        title={`${t.projects.title} · ${t.enums.workspace[ws]}`}
        actions={
          <Link href={showArchived ? "/tasks/projects" : "/tasks/projects?archived=1"} className="btn btn-sm">
            {showArchived ? "✓ " : ""}
            {t.projects.showArchived}
          </Link>
        }
      />
      <Section>
        {rows.length === 0 ? (
          <Empty>{t.projects.empty}</Empty>
        ) : (
          <ul className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
            {rows.map(({ project: p, open, done, overdue, nextDue }) => {
              const total = open + done;
              return (
                <li key={p.id}>
                  <Link href={`/tasks/projects/${p.id}`} className="card block h-full p-4 hover:bg-surface-2">
                    <div className="flex items-center gap-2">
                      <ColorDot color={p.color} className="h-3 w-3" />
                      <span className="truncate font-medium">{p.name}</span>
                      {p.status !== "active" && <Badge>{t.enums.projectStatus[p.status]}</Badge>}
                    </div>
                    <div className="mt-3 h-1.5 rounded-full bg-surface-2">
                      <div className="h-1.5 rounded-full bg-accent" style={{ width: `${total ? (done / total) * 100 : 0}%` }} />
                    </div>
                    <p className="mt-2 flex flex-wrap gap-x-2 text-xs text-muted">
                      <span>{fmt(t.projects.progress, { done, total })}</span>
                      {overdue > 0 && <span className="text-out">· {fmt(t.projects.overdue, { n: overdue })}</span>}
                      {nextDue && <span>· {fmt(t.projects.nextDue, { date: formatShortDate(nextDue) })}</span>}
                      {p.dueDate && <span>· ⚑ {formatShortDate(p.dueDate)}</span>}
                    </p>
                  </Link>
                </li>
              );
            })}
          </ul>
        )}
      </Section>

      <Section title={t.projects.new}>
        <ActionForm action={createProjectAction} className="card grid gap-3 p-4 sm:grid-cols-2 lg:grid-cols-4 lg:items-end">
          <Field label={t.projects.name}>
            <input name="name" required className="input" placeholder="Kitchen renovation, Tax 2026…" />
          </Field>
          <Field label={t.projects.template}>
            <select name="template" className="input" defaultValue="board">
              {(["board", "list", "empty"] as const).map((k) => (
                <option key={k} value={k}>{t.projects.templates[k]}</option>
              ))}
            </select>
          </Field>
          <Field label={t.projects.color}>
            <select name="color" className="input" defaultValue="teal">
              {PROJECT_COLORS.map((c) => (
                <option key={c} value={c}>{c}</option>
              ))}
            </select>
          </Field>
          <Field label={`${t.tasks.dueDate} (${t.common.optional})`}>
            <input type="date" name="dueDate" className="input" />
          </Field>
          <Field label={t.projects.description} className="sm:col-span-2 lg:col-span-3">
            <input name="description" className="input" />
          </Field>
          <SubmitButton>{t.common.create}</SubmitButton>
        </ActionForm>
      </Section>
    </>
  );
}
