import { addDays, addMonths, type ISODate } from "./dates";

export type RecurrenceSpec = {
  frequency: "daily" | "weekly" | "monthly" | "yearly";
  interval: number;
  startDate: ISODate;
  endDate?: ISODate | null;
};

/** The n-th occurrence (0-based). Months/years are computed from the start to avoid drift. */
function nth(spec: RecurrenceSpec, n: number): ISODate {
  const step = n * spec.interval;
  switch (spec.frequency) {
    case "daily":
      return addDays(spec.startDate, step);
    case "weekly":
      return addDays(spec.startDate, step * 7);
    case "monthly":
      return addMonths(spec.startDate, step);
    case "yearly":
      return addMonths(spec.startDate, step * 12);
  }
}

/** All occurrence dates in [from, to] (inclusive), respecting start and end dates. */
export function occurrencesBetween(spec: RecurrenceSpec, from: ISODate, to: ISODate): ISODate[] {
  const out: ISODate[] = [];
  const last = spec.endDate && spec.endDate < to ? spec.endDate : to;
  if (last < spec.startDate || last < from) return out;

  // Skip ahead cheaply for daily/weekly rules with an old start date.
  let n = 0;
  if (spec.frequency === "daily" || spec.frequency === "weekly") {
    const unit = spec.frequency === "daily" ? 1 : 7;
    const days = Math.floor(
      (Date.parse(`${from}T00:00:00Z`) - Date.parse(`${spec.startDate}T00:00:00Z`)) / 86_400_000,
    );
    if (days > 0) n = Math.floor(days / (unit * spec.interval));
  }

  for (let guard = 0; guard < 100_000; guard++, n++) {
    const d = nth(spec, n);
    if (d > last) break;
    if (d >= from) out.push(d);
  }
  return out;
}
