import { addDays, addMonths, startOfMonth, type ISODate } from "./dates";

/** Monday of the week containing `d`. */
export function startOfWeek(d: ISODate): ISODate {
  const dow = new Date(`${d}T00:00:00Z`).getUTCDay(); // 0 = Sunday
  return addDays(d, -((dow + 6) % 7));
}

/** The visible days of a month grid (full weeks, Monday first) or of one week. */
export function gridDays(anchor: ISODate, view: "month" | "week"): ISODate[] {
  if (view === "week") {
    const start = startOfWeek(anchor);
    return Array.from({ length: 7 }, (_, i) => addDays(start, i));
  }
  const first = startOfMonth(anchor);
  const start = startOfWeek(first);
  const nextMonth = addMonths(first, 1);
  const days: ISODate[] = [];
  for (let d = start; d < nextMonth || days.length % 7 !== 0; d = addDays(d, 1)) days.push(d);
  return days;
}

export function shiftAnchor(anchor: ISODate, view: "month" | "week", dir: 1 | -1): ISODate {
  return view === "week" ? addDays(anchor, 7 * dir) : addMonths(startOfMonth(anchor), dir);
}
