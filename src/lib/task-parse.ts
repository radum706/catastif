// Pure parser for the task quick-add line, e.g.
//   "Call accountant tomorrow 14:00 !high #admin"
//   "Order tiles fri #site"
//   "Renew insurance @2026-11-01"

import type { ISODate } from "./dates";
import { parseDateToken } from "./quick-add";

export type ParsedTask = {
  title: string;
  dueDate: ISODate | null;
  dueTime: string | null;
  priority: "none" | "low" | "medium" | "high";
  tags: string[];
};

const PRIORITY: Record<string, ParsedTask["priority"]> = {
  "!high": "high",
  "!h": "high",
  "!!!": "high",
  "!medium": "medium",
  "!med": "medium",
  "!m": "medium",
  "!!": "medium",
  "!low": "low",
  "!l": "low",
  "!": "low",
};

export function parseTaskLine(input: string, today: ISODate): ParsedTask {
  const rest: string[] = [];
  let dueDate: ISODate | null = null;
  let dueTime: string | null = null;
  let priority: ParsedTask["priority"] = "none";
  const tags: string[] = [];

  for (const tok of input.trim().split(/\s+/).filter(Boolean)) {
    const lower = tok.toLowerCase();
    const d = parseDateToken(tok, today);
    if (d) {
      dueDate = d;
      continue;
    }
    const time = /^(\d{1,2})[:.h](\d{2})$/.exec(lower);
    if (time && Number(time[1]) < 24 && Number(time[2]) < 60) {
      dueTime = `${time[1].padStart(2, "0")}:${time[2]}`;
      continue;
    }
    if (PRIORITY[lower]) {
      priority = PRIORITY[lower];
      continue;
    }
    if (tok.startsWith("#") && tok.length > 1) {
      tags.push(tok.slice(1).replace(/[-_]/g, " "));
      continue;
    }
    rest.push(tok);
  }

  const title = rest.join(" ");
  return {
    title: title ? title.charAt(0).toUpperCase() + title.slice(1) : "",
    dueDate: dueDate ?? (dueTime ? today : null),
    dueTime,
    priority,
    tags,
  };
}
