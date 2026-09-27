// Minimal RFC 5545 writer for a read-only subscription feed.

export type IcalEvent = {
  uid: string;
  summary: string;
  date: string; // YYYY-MM-DD
  time?: string | null; // HH:MM, local to tz
  durationMinutes?: number;
  description?: string;
  url?: string;
  categories?: string[];
};

function escape(text: string) {
  return text.replace(/\\/g, "\\\\").replace(/;/g, "\;").replace(/,/g, "\\,").replace(/\r?\n/g, "\\n");
}

/** Lines longer than 75 octets are folded with CRLF + space. */
function fold(line: string) {
  const bytes = Buffer.from(line, "utf8");
  if (bytes.length <= 75) return line;
  const parts: string[] = [];
  let start = 0;
  while (start < bytes.length) {
    let end = Math.min(start + (start === 0 ? 75 : 74), bytes.length);
    // don't split a multi-byte character
    while (end < bytes.length && (bytes[end] & 0xc0) === 0x80) end--;
    parts.push(bytes.subarray(start, end).toString("utf8"));
    start = end;
  }
  return parts.join("\r\n ");
}

const compact = (d: string) => d.replace(/-/g, "");

function nextDay(d: string) {
  const x = new Date(`${d}T00:00:00Z`);
  x.setUTCDate(x.getUTCDate() + 1);
  return x.toISOString().slice(0, 10);
}

function addMinutes(date: string, time: string, minutes: number) {
  const [h, m] = time.split(":").map(Number);
  const x = new Date(`${date}T00:00:00Z`);
  x.setUTCMinutes(h * 60 + m + minutes);
  return `${x.toISOString().slice(0, 10).replace(/-/g, "")}T${x.toISOString().slice(11, 16).replace(":", "")}00`;
}

export function buildIcal(opts: { name: string; tz: string; events: IcalEvent[]; now?: Date }) {
  const stamp = (opts.now ?? new Date()).toISOString().replace(/[-:]/g, "").replace(/\.\d+/, "");
  const lines = [
    "BEGIN:VCALENDAR",
    "VERSION:2.0",
    "PRODID:-//Catastif//Calendar//EN",
    "CALSCALE:GREGORIAN",
    "METHOD:PUBLISH",
    `X-WR-CALNAME:${escape(opts.name)}`,
    `X-WR-TIMEZONE:${opts.tz}`,
    "REFRESH-INTERVAL;VALUE=DURATION:PT30M",
  ];
  for (const e of opts.events) {
    lines.push("BEGIN:VEVENT", `UID:${e.uid}`, `DTSTAMP:${stamp}`);
    if (e.time) {
      lines.push(`DTSTART;TZID=${opts.tz}:${compact(e.date)}T${e.time.replace(":", "")}00`);
      lines.push(`DTEND;TZID=${opts.tz}:${addMinutes(e.date, e.time, e.durationMinutes ?? 30)}`);
    } else {
      lines.push(`DTSTART;VALUE=DATE:${compact(e.date)}`, `DTEND;VALUE=DATE:${compact(nextDay(e.date))}`);
    }
    lines.push(`SUMMARY:${escape(e.summary)}`);
    if (e.description) lines.push(`DESCRIPTION:${escape(e.description)}`);
    if (e.url) lines.push(`URL:${e.url}`);
    if (e.categories?.length) lines.push(`CATEGORIES:${e.categories.map(escape).join(",")}`);
    lines.push("TRANSP:TRANSPARENT", "END:VEVENT");
  }
  lines.push("END:VCALENDAR");
  return lines.map(fold).join("\r\n") + "\r\n";
}
