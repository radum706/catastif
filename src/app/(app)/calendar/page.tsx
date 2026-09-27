import Link from "next/link";
import { Agenda } from "@/components/agenda";
import { CalendarGrid } from "@/components/calendar-grid";
import { PageHeader } from "@/components/ui";
import { gridDays, shiftAnchor } from "@/lib/calendar-grid";
import { isISODate, today } from "@/lib/dates";
import { calendar } from "@/server/api";
import { param } from "@/server/form-data";
import { parseView } from "@/server/workspace";
import { t } from "@/i18n";

export const metadata = { title: t.calendar.title };

export default async function CalendarPage({ searchParams }: PageProps<"/calendar">) {
  const sp = await searchParams;
  const now = today();
  const view = param(sp, "view") === "week" ? "week" : "month";
  const raw = param(sp, "date");
  const anchor = raw && isISODate(raw) ? raw : now;
  const ws = parseView(sp.ws, "all");
  const paid = param(sp, "paid") === "1";
  const days = gridDays(anchor, view);
  const items = await calendar.calendarItems({
    from: days[0],
    to: days[days.length - 1],
    workspace: ws === "all" ? undefined : ws,
    showSettled: paid,
  });

  const link = (over: Record<string, string>) => {
    const q = new URLSearchParams({ view, date: anchor, ws, ...(paid ? { paid: "1" } : {}), ...over });
    if (q.get("paid") === "0") q.delete("paid");
    return `/calendar?${q}`;
  };
  const title = new Intl.DateTimeFormat("en-GB", { month: "long", year: "numeric", timeZone: "UTC" }).format(new Date(`${anchor}T00:00:00Z`));
  const tab = (active: boolean) => `rounded-md px-2.5 py-1 text-sm ${active ? "bg-surface-2 font-medium" : "text-muted hover:text-fg"}`;

  return (
    <>
      <PageHeader title={`${t.calendar.title} · ${title}`} />
      <div className="mb-4 flex flex-wrap items-center gap-2">
        <div className="flex gap-1">
          <Link href={link({ date: shiftAnchor(anchor, view, -1) })} className="btn btn-sm" aria-label={t.calendar.prev}>←</Link>
          <Link href={link({ date: now })} className="btn btn-sm">{t.calendar.today}</Link>
          <Link href={link({ date: shiftAnchor(anchor, view, 1) })} className="btn btn-sm" aria-label={t.calendar.next}>→</Link>
        </div>
        <div className="flex rounded-lg border border-border bg-surface p-0.5">
          <Link href={link({ view: "month" })} className={tab(view === "month")}>{t.calendar.month}</Link>
          <Link href={link({ view: "week" })} className={tab(view === "week")}>{t.calendar.week}</Link>
        </div>
        <div className="flex rounded-lg border border-border bg-surface p-0.5">
          {(["all", "personal", "work"] as const).map((w) => (
            <Link key={w} href={link({ ws: w })} className={tab(ws === w)}>{t.enums.workspace[w]}</Link>
          ))}
        </div>
        <Link href={link({ paid: paid ? "0" : "1" })} className="btn btn-sm">
          {paid ? "✓ " : ""}
          {t.calendar.showPaid}
        </Link>
      </div>
      <div className="hidden md:block">
        <CalendarGrid days={days} items={items} today={now} month={anchor.slice(0, 7)} view={view} showWorkspace={ws === "all"} />
      </div>
      <div className="md:hidden">
        <Agenda items={items.filter((i) => view === "week" || i.date.startsWith(anchor.slice(0, 7)))} showWorkspace={ws === "all"} />
      </div>
    </>
  );
}
