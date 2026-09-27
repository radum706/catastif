import { calendar, tasks } from "@/server/api";
import { addDays, appTimeZone, today } from "@/lib/dates";
import { buildIcal, type IcalEvent } from "@/lib/ical";
import { formatMoney } from "@/lib/money";
import { handler, qp, readWorkspace } from "@/server/rest";

/**
 * Subscribe from your phone/desktop calendar:
 *   https://<host>/api/v1/ical?token=cat_…&workspace=work
 * Needs a token with the "calendar" scope. Read-only; refreshes every 30 minutes.
 */
export const GET = handler(
  "calendar",
  async ({ token, url }) => {
    const workspace = readWorkspace(token, qp(url, "workspace"));
    const now = today();
    const items = await calendar.calendarItems({ from: addDays(now, -30), to: addDays(now, 180), workspace, showCompleted: false });
    const estimates = new Map<number, number | null>();
    const taskIds = items.filter((i) => i.kind === "task" && i.time && i.id).map((i) => i.id!);
    if (taskIds.length) {
      for (const r of await tasks.listTasks({ workspace, completed: false, dueFrom: addDays(now, -30), dueTo: addDays(now, 180), limit: 2000 })) {
        estimates.set(r.task.id, r.task.estimateMinutes);
      }
    }
    const base = `${url.protocol}//${url.host}`;
    const prefix = { task: "", bill: "💸 ", income: "💰 ", recurring: "↻ ", project: "⚑ ", paid: "", received: "" } as const;
    const events: IcalEvent[] = items.map((i) => ({
      uid: `${i.key}@catastif`,
      summary: `${prefix[i.kind]}${i.title}${i.amount != null && i.currency ? ` · ${formatMoney(i.amount, i.currency)}` : ""}`,
      date: i.date,
      time: i.time,
      durationMinutes: (i.id && estimates.get(i.id)) || 30,
      categories: [i.workspace === "work" ? "Work" : "Personal", i.kind],
      url:
        i.kind === "task"
          ? `${base}/tasks/${i.id}`
          : i.kind === "project"
            ? `${base}/tasks/projects/${i.id}`
            : i.kind === "recurring"
              ? `${base}/settings/recurring/${i.id}`
              : `${base}/money/transactions/${i.id}`,
    }));
    const name = workspace ? `Catastif · ${workspace === "work" ? "Work" : "Personal"}` : "Catastif";
    return new Response(buildIcal({ name, tz: appTimeZone(), events }), {
      headers: { "content-type": "text/calendar; charset=utf-8", "cache-control": "private, max-age=300" },
    });
  },
  { allowQueryToken: true },
);
