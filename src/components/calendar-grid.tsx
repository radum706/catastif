"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useOptimistic, useState, useTransition } from "react";
import { formatMoney } from "@/lib/money";
import type { CalendarItem } from "@/server/api/calendar";
import { rescheduleAction } from "@/server/actions/tasks";
import { fmt, t } from "@/i18n";

const KIND_STYLE: Record<CalendarItem["kind"], string> = {
  task: "bg-surface-2",
  project: "bg-accent/15 font-medium",
  bill: "bg-out/10 text-out",
  income: "bg-in/10 text-in",
  paid: "bg-surface-2 text-muted line-through",
  received: "bg-surface-2 text-muted line-through",
  recurring: "border border-dashed border-border text-muted",
};

function href(item: CalendarItem) {
  if (item.kind === "task") return `/tasks/${item.id}`;
  if (item.kind === "project") return `/tasks/projects/${item.id}`;
  if (item.kind === "recurring") return `/settings/recurring/${item.id}`;
  return `/money/transactions/${item.id}`;
}

function Chip({ item, showWorkspace, onDragStart }: { item: CalendarItem; showWorkspace: boolean; onDragStart: (key: string) => void }) {
  const prefix = item.kind === "project" ? "⚑ " : item.kind === "recurring" ? "↻ " : item.kind === "task" && item.done ? "✓ " : "";
  return (
    <Link
      href={href(item)}
      draggable={item.movable}
      onDragStart={(e) => {
        e.dataTransfer.setData("text/plain", item.key);
        e.dataTransfer.effectAllowed = "move";
        onDragStart(item.key);
      }}
      title={`${t.calendar.kinds[item.kind]}: ${item.title}`}
      className={`flex items-center gap-1 truncate rounded px-1.5 py-0.5 text-[11px] leading-4 ${KIND_STYLE[item.kind]} ${
        item.overdue ? "ring-1 ring-out/50" : ""
      } ${item.movable ? "cursor-grab active:cursor-grabbing" : ""} ${item.done && item.kind === "task" ? "text-muted line-through" : ""}`}
      style={
        showWorkspace
          ? { borderLeft: `3px solid var(--ws-${item.workspace})` }
          : item.kind === "task" && item.color
            ? { borderLeft: `3px solid var(--p-${item.color})` }
            : undefined
      }
    >
      <span className="truncate">
        {item.time && <span className="num mr-1 opacity-70">{item.time}</span>}
        {prefix}
        {item.title}
      </span>
      {item.amount != null && item.currency && (
        <span className="num ml-auto shrink-0 opacity-80">{formatMoney(item.amount, item.currency).replace(/\.00$/, "")}</span>
      )}
    </Link>
  );
}

export function CalendarGrid({
  days,
  items,
  today,
  month,
  view,
  showWorkspace,
}: {
  days: string[];
  items: CalendarItem[];
  today: string;
  /** "YYYY-MM" of the month shown; other days are dimmed. */
  month: string;
  view: "month" | "week";
  showWorkspace: boolean;
}) {
  const router = useRouter();
  const [, start] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const [dragging, setDragging] = useState<string | null>(null);
  const [over, setOver] = useState<string | null>(null);
  const [expanded, setExpanded] = useState<Set<string>>(new Set());
  const [optimistic, move] = useOptimistic(items, (state, m: { key: string; date: string }) =>
    state.map((i) => (i.key === m.key ? { ...i, date: m.date, overdue: false } : i)),
  );

  const byDay = new Map<string, CalendarItem[]>();
  for (const i of optimistic) byDay.set(i.date, [...(byDay.get(i.date) ?? []), i]);
  const limit = view === "week" ? 50 : 4;

  function drop(date: string, key: string) {
    setOver(null);
    setDragging(null);
    const item = optimistic.find((i) => i.key === key);
    if (!item || !item.movable || item.date === date) return;
    start(async () => {
      move({ key, date });
      const res = await rescheduleAction({ key, date });
      setError(res.error ?? null);
      router.refresh();
    });
  }

  return (
    <div>
      {error && <p className="mb-2 rounded-lg bg-out/10 px-3 py-2 text-sm text-out">{error}</p>}
      <div className="card overflow-hidden">
        <div className="grid grid-cols-7 border-b border-border bg-surface-2 text-center text-[11px] font-medium uppercase text-muted">
          {t.calendar.weekdays.map((d) => (
            <div key={d} className="py-1.5">{d}</div>
          ))}
        </div>
        <div className="grid grid-cols-7">
          {days.map((d, idx) => {
            const list = byDay.get(d) ?? [];
            const open = expanded.has(d);
            const shown = open ? list : list.slice(0, limit);
            const dim = view === "month" && !d.startsWith(month);
            return (
              <div
                key={d}
                onDragOver={(e) => {
                  if (!dragging) return;
                  e.preventDefault();
                  setOver(d);
                }}
                onDragLeave={() => setOver((o) => (o === d ? null : o))}
                onDrop={(e) => {
                  e.preventDefault();
                  drop(d, e.dataTransfer.getData("text/plain"));
                }}
                className={`min-w-0 border-border p-1 ${idx % 7 !== 6 ? "border-r" : ""} ${idx < days.length - 7 ? "border-b" : ""} ${
                  view === "week" ? "min-h-64" : "min-h-24"
                } ${dim ? "bg-surface-2/50" : ""} ${over === d ? "bg-accent/10" : ""}`}
              >
                <div className={`mb-1 flex justify-end text-xs ${dim ? "text-muted" : ""}`}>
                  <span className={`num rounded-full px-1.5 ${d === today ? "bg-accent font-semibold text-accent-fg" : ""}`}>
                    {Number(d.slice(8))}
                  </span>
                </div>
                <div className="space-y-0.5">
                  {shown.map((i) => (
                    <Chip key={i.key} item={i} showWorkspace={showWorkspace} onDragStart={setDragging} />
                  ))}
                  {list.length > shown.length && (
                    <button
                      type="button"
                      className="w-full text-left text-[11px] text-muted hover:text-fg"
                      onClick={() => setExpanded((s) => new Set(s).add(d))}
                    >
                      {fmt(t.calendar.more, { n: list.length - shown.length })}
                    </button>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      </div>
      <p className="mt-2 text-xs text-muted">{t.calendar.dragHint}</p>
    </div>
  );
}
