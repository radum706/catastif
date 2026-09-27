import Link from "next/link";
import { WorkspaceBadge } from "@/components/ui";
import { formatShortDate } from "@/lib/dates";
import { formatMoney } from "@/lib/money";
import type { CalendarItem } from "@/server/api/calendar";
import { dueLabel } from "@/components/task-row";
import { t } from "@/i18n";

function href(item: CalendarItem) {
  if (item.kind === "task") return `/tasks/${item.id}`;
  if (item.kind === "project") return `/tasks/projects/${item.id}`;
  if (item.kind === "recurring") return `/settings/recurring/${item.id}`;
  return `/money/transactions/${item.id}`;
}

const ICON: Record<CalendarItem["kind"], string> = {
  task: "○",
  project: "⚑",
  bill: "↑",
  income: "↓",
  paid: "✓",
  received: "✓",
  recurring: "↻",
};

/** Day-by-day list; used on phones instead of the grid, and on Home. */
export function Agenda({ items, showWorkspace, emptyText }: { items: CalendarItem[]; showWorkspace: boolean; emptyText?: string }) {
  const days = new Map<string, CalendarItem[]>();
  for (const i of items) days.set(i.date, [...(days.get(i.date) ?? []), i]);
  if (!days.size) return <p className="card p-4 text-sm text-muted">{emptyText ?? t.common.empty}</p>;
  return (
    <div className="space-y-3">
      {[...days.entries()].map(([day, list]) => (
        <div key={day}>
          <p className="mb-1 text-xs font-semibold uppercase tracking-wide text-muted">{dueLabel(day)} · {formatShortDate(day)}</p>
          <ul className="card divide-y divide-border">
            {list.map((i) => (
              <li key={i.key}>
                <Link href={href(i)} className="flex items-center gap-2 px-3 py-2 text-sm hover:bg-surface-2">
                  <span className={`w-4 text-center ${i.kind === "bill" ? "text-out" : i.kind === "income" ? "text-in" : "text-muted"}`}>
                    {i.kind === "task" && i.done ? "✓" : ICON[i.kind]}
                  </span>
                  {showWorkspace && <WorkspaceBadge ws={i.workspace} />}
                  <span className={`truncate ${i.done ? "text-muted line-through" : ""} ${i.overdue ? "text-out" : ""}`}>
                    {i.time && <span className="num mr-1 text-muted">{i.time}</span>}
                    {i.title}
                  </span>
                  {i.amount != null && i.currency && (
                    <span className={`num ml-auto shrink-0 ${i.direction === "in" ? "text-in" : "text-out"}`}>
                      {i.direction === "in" ? "+" : "−"}
                      {formatMoney(i.amount, i.currency)}
                    </span>
                  )}
                </Link>
              </li>
            ))}
          </ul>
        </div>
      ))}
    </div>
  );
}
