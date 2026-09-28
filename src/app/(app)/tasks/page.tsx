import { TaskList, TaskRow } from "@/components/task-row";
import { TaskQuickAdd } from "@/components/task-quick-add";
import { Empty, PageHeader, Section } from "@/components/ui";
import { today } from "@/lib/dates";
import { tasks } from "@/server/api";
import type { TaskRow as Row } from "@/server/api/tasks";
import { getWorkspace } from "@/server/workspace";
import { t } from "@/i18n";

export const metadata = { title: t.tasks.title };

function Group({ title, rows, tone }: { title: string; rows: Row[]; tone?: string }) {
  if (!rows.length) return null;
  return (
    <Section title={`${title} (${rows.length})`} className={tone}>
      <TaskList>
        {rows.map((r) => (
          <TaskRow key={r.task.id} row={r} />
        ))}
      </TaskList>
    </Section>
  );
}

export default async function MyTasksPage() {
  const ws = await getWorkspace();
  const my = await tasks.myTasks({ workspace: ws });
  const open = my.overdue.length + my.today.length + my.thisWeek.length + my.later.length + my.noDate.length;
  return (
    <>
      <PageHeader title={`${t.tasks.title} · ${t.enums.workspace[ws]}`} intro={t.tasks.intro} />
      <div className="mb-6">
        <TaskQuickAdd today={today()} />
      </div>
      {open === 0 && <Empty>{t.tasks.empty}</Empty>}
      <Group title={t.tasks.overdue} rows={my.overdue} />
      <Group title={t.tasks.today} rows={my.today} />
      <Group title={t.tasks.thisWeek} rows={my.thisWeek} />
      <Group title={t.tasks.later} rows={my.later} />
      <Group title={t.tasks.noDate} rows={my.noDate} />
      {my.recentlyCompleted.length > 0 && (
        <details className="mb-6">
          <summary className="mb-2 cursor-pointer text-sm font-semibold uppercase tracking-wide text-muted">
            {t.tasks.recentlyCompleted} ({my.recentlyCompleted.length})
          </summary>
          <TaskList>
            {my.recentlyCompleted.map((r) => (
              <TaskRow key={r.task.id} row={r} />
            ))}
          </TaskList>
        </details>
      )}
    </>
  );
}
