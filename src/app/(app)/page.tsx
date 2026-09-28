import Link from "next/link";
import { Agenda } from "@/components/agenda";
import { TaskList, TaskRow } from "@/components/task-row";
import { TaskQuickAdd } from "@/components/task-quick-add";
import { Empty, Section, WorkspaceBadge } from "@/components/ui";
import { addDays, formatDate, formatShortDate, today } from "@/lib/dates";
import { formatMoney } from "@/lib/money";
import { calendar, forecast, tasks } from "@/server/api";
import { getWorkspace, parseView } from "@/server/workspace";
import { WORKSPACES } from "@/server/api/workspace";
import { fmt, t } from "@/i18n";

export const metadata = { title: t.home.title };

export default async function HomePage({ searchParams }: PageProps<"/">) {
  const sp = await searchParams;
  const view = parseView(sp.view, "all");
  const current = await getWorkspace();
  const ws = view === "all" ? undefined : view;
  const now = today();
  const shownWorkspaces = view === "all" ? WORKSPACES : [view];

  const [due, upcoming, safe] = await Promise.all([
    tasks.listTasks({ workspace: ws, completed: false, dueTo: now }),
    calendar.calendarItems({ from: addDays(now, 1), to: addDays(now, 7), workspace: ws, showCompleted: false }),
    Promise.all(shownWorkspaces.map(async (w) => ({ ws: w, items: await forecast.safeToSpend(w) }))),
  ]);
  const tab = (active: boolean) => `rounded-md px-2.5 py-1 text-sm ${active ? "bg-surface-2 font-medium" : "text-muted hover:text-fg"}`;

  return (
    <>
      <div className="mb-5 flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">{t.home.greeting}</h1>
          <p className="text-sm text-muted">{formatDate(now)}</p>
        </div>
        <div className="flex rounded-lg border border-border bg-surface p-0.5">
          {(["all", "personal", "work"] as const).map((v) => (
            <Link key={v} href={v === "all" ? "/" : `/?view=${v}`} className={tab(view === v)}>
              {t.enums.workspace[v]}
            </Link>
          ))}
        </div>
      </div>

      <div className="mb-6">
        <TaskQuickAdd today={now} workspace={ws ?? current} placeholder={`${t.tasks.quickAddPlaceholder} → ${t.enums.workspace[ws ?? current]}`} />
      </div>

      <div className="grid gap-6 lg:grid-cols-[3fr_2fr]">
        <div>
          <Section title={`${t.home.todayTasks} (${due.length})`}>
            {due.length ? (
              <TaskList>
                {due.map((r) => (
                  <TaskRow key={r.task.id} row={r} showWorkspace={view === "all"} />
                ))}
              </TaskList>
            ) : (
              <Empty>{t.home.noTasksToday}</Empty>
            )}
          </Section>
          <Section title={t.home.week} aside={<Link href="/calendar" className="text-xs text-accent">{t.nav.calendar} →</Link>}>
            <Agenda items={upcoming} showWorkspace={view === "all"} />
          </Section>
        </div>

        <Section title={t.home.moneyPulse} aside={<Link href="/money" className="text-xs text-accent">{t.nav.money} →</Link>}>
          <div className="space-y-3">
            {safe.map(({ ws: w, items }) => (
              <div key={w} className="card p-4">
                <div className="mb-2 flex items-center gap-2">
                  <WorkspaceBadge ws={w} long />
                  <span className="text-xs text-muted">{t.home.safeToSpend}</span>
                </div>
                {items.length === 0 && (
                  <p className="text-sm text-muted">
                    {t.home.setupHint}
                  </p>
                )}
                {items.map((s) => (
                  <div key={s.currency} className="mb-2 last:mb-0">
                    <p className={`num text-2xl font-semibold ${s.safe < 0 ? "text-out" : ""}`}>{formatMoney(s.safe, s.currency)}</p>
                    <p className="text-xs text-muted">
                      {fmt(t.home.safeHint, { until: formatShortDate(s.until) })}: {formatMoney(s.current, s.currency)} − {formatMoney(s.billsBeforeIncome, s.currency)}
                    </p>
                  </div>
                ))}
              </div>
            ))}
          </div>
        </Section>
      </div>
    </>
  );
}
