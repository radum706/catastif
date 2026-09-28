// Calendar dates are plain "YYYY-MM-DD" strings everywhere. Arithmetic is done in UTC
// so DST never shifts a day.

export type ISODate = string;

const ISO_RE = /^\d{4}-\d{2}-\d{2}$/;

export function isISODate(s: string): boolean {
  if (!ISO_RE.test(s)) return false;
  const d = new Date(`${s}T00:00:00Z`);
  return !Number.isNaN(d.getTime()) && d.toISOString().slice(0, 10) === s;
}

export function appTimeZone(): string {
  return process.env.APP_TZ || process.env.NEXT_PUBLIC_APP_TZ || "Europe/Bucharest";
}

/** Today's date in the app timezone. */
export function today(tz: string = appTimeZone(), now: Date = new Date()): ISODate {
  // en-CA formats as YYYY-MM-DD.
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: tz,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(now);
}

function toUTC(d: ISODate): Date {
  return new Date(`${d}T00:00:00Z`);
}

function fromUTC(d: Date): ISODate {
  return d.toISOString().slice(0, 10);
}

export function addDays(d: ISODate, n: number): ISODate {
  const x = toUTC(d);
  x.setUTCDate(x.getUTCDate() + n);
  return fromUTC(x);
}

function daysInMonth(year: number, month0: number): number {
  return new Date(Date.UTC(year, month0 + 1, 0)).getUTCDate();
}

/** Month arithmetic that keeps the day, clamped to the month's end (Jan 31 + 1 → Feb 28/29). */
export function addMonths(d: ISODate, n: number, preferredDay?: number): ISODate {
  const x = toUTC(d);
  const day = preferredDay ?? x.getUTCDate();
  const total = x.getUTCFullYear() * 12 + x.getUTCMonth() + n;
  const year = Math.floor(total / 12);
  const month0 = total - year * 12;
  const clamped = Math.min(day, daysInMonth(year, month0));
  return fromUTC(new Date(Date.UTC(year, month0, clamped)));
}

export function daysBetween(from: ISODate, to: ISODate): number {
  return Math.round((toUTC(to).getTime() - toUTC(from).getTime()) / 86_400_000);
}

export function minDate(a: ISODate, b: ISODate): ISODate {
  return a < b ? a : b;
}

export function maxDate(a: ISODate, b: ISODate): ISODate {
  return a > b ? a : b;
}

export function startOfMonth(d: ISODate): ISODate {
  return `${d.slice(0, 7)}-01`;
}

export function endOfMonth(d: ISODate): ISODate {
  return addDays(addMonths(startOfMonth(d), 1), -1);
}

export function formatDate(d: ISODate, locale = "en-GB"): string {
  return new Intl.DateTimeFormat(locale, {
    day: "numeric",
    month: "short",
    year: "numeric",
    timeZone: "UTC",
  }).format(toUTC(d));
}

export function formatShortDate(d: ISODate, locale = "en-GB"): string {
  return new Intl.DateTimeFormat(locale, { day: "numeric", month: "short", timeZone: "UTC" }).format(
    toUTC(d),
  );
}

export function formatWeekday(d: ISODate, locale = "en-GB"): string {
  return new Intl.DateTimeFormat(locale, { weekday: "long", timeZone: "UTC" }).format(toUTC(d));
}
