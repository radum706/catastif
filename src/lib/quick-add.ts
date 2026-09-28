// Pure parser for the one-line quick-add box, e.g.
//   "-45 Lidl food"            money out, settled today
//   "+4500 salary"             money in, settled today
//   "-230 Enel unpaid @15"     a bill due on the 15th of this month
//   "-60 fuel #car yesterday"  category by #tag, date keyword
// It runs in the browser for the live preview and on the server for the real insert.

import { addDays, isISODate, type ISODate } from "./dates";
import { parseAmount } from "./money";

export type QuickAddPayee = {
  id: number;
  name: string;
  defaultDirection: "in" | "out" | null;
  defaultCategoryId: number | null;
  defaultAccountId: number | null;
};
export type QuickAddCategory = { id: number; name: string; kind: "income" | "expense" };

export type QuickAddResult = {
  direction: "in" | "out";
  amount: number | null;
  title: string;
  date: ISODate;
  dueDate: ISODate | null;
  status: "upcoming" | "paid" | "received";
  payeeId: number | null;
  categoryId: number | null;
  accountId: number | null;
};

const AMOUNT_RE = /^([+-])?(\d[\d.,]*)$/;
const UNPAID_WORDS = new Set(["unpaid", "due", "bill", "todo"]);

const WEEKDAYS = ["sun", "mon", "tue", "wed", "thu", "fri", "sat"];

/** "today", "tomorrow", "yesterday", "mon".."sunday" (next one), "@15", "@15.10", "@2026-10-01". */
export function parseDateToken(token: string, today: ISODate): ISODate | null {
  const t = token.toLowerCase();
  if (t === "today" || t === "azi") return today;
  if (t === "yesterday" || t === "ieri") return addDays(today, -1);
  if (t === "tomorrow" || t === "tmrw" || t === "maine") return addDays(today, 1);
  const wd = WEEKDAYS.findIndex((d) => t === d || (t.length > 3 && d === t.slice(0, 3) && /^[a-z]+day$/.test(t)));
  if (wd !== -1) {
    const current = new Date(`${today}T00:00:00Z`).getUTCDay();
    const diff = (wd - current + 7) % 7 || 7;
    return addDays(today, diff);
  }
  if (!t.startsWith("@")) return null;
  const v = t.slice(1);
  if (isISODate(v)) return v;
  const [y, m] = [today.slice(0, 4), today.slice(5, 7)];
  let match = /^(\d{1,2})[./](\d{1,2})$/.exec(v);
  if (match) {
    const d = `${y}-${match[2].padStart(2, "0")}-${match[1].padStart(2, "0")}`;
    return isISODate(d) ? d : null;
  }
  match = /^(\d{1,2})$/.exec(v);
  if (match) {
    const d = `${y}-${m}-${match[1].padStart(2, "0")}`;
    return isISODate(d) ? d : null;
  }
  return null;
}

function escapeRe(s: string) {
  return s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function containsWords(haystack: string, needle: string): boolean {
  return new RegExp(`(^|\\s)${escapeRe(needle.toLowerCase())}(\\s|$)`).test(haystack.toLowerCase());
}

export function parseQuickAdd(
  input: string,
  ctx: { today: ISODate; payees: QuickAddPayee[]; categories: QuickAddCategory[] },
): QuickAddResult {
  const tokens = input.trim().split(/\s+/).filter(Boolean);
  const rest: string[] = [];
  let sign: "+" | "-" | null = null;
  let amount: number | null = null;
  let date: ISODate | null = null;
  let unpaid = false;
  let tagCategory: QuickAddCategory | null = null;

  for (const tok of tokens) {
    const am = amount === null ? AMOUNT_RE.exec(tok) : null;
    if (am) {
      const parsed = parseAmount(am[2]);
      if (parsed !== null && parsed > 0) {
        amount = parsed;
        sign = (am[1] as "+" | "-" | undefined) ?? null;
        continue;
      }
    }
    const d = parseDateToken(tok, ctx.today);
    if (d) {
      date = d;
      continue;
    }
    if (UNPAID_WORDS.has(tok.toLowerCase())) {
      unpaid = true;
      continue;
    }
    if (tok.startsWith("#") && tok.length > 1) {
      const name = tok.slice(1).replace(/[-_]/g, " ").toLowerCase();
      const hit = ctx.categories.find((c) => c.name.toLowerCase() === name);
      if (hit) {
        tagCategory = hit;
        continue;
      }
    }
    rest.push(tok);
  }

  const text = rest.join(" ");
  const payee =
    [...ctx.payees]
      .sort((a, b) => b.name.length - a.name.length)
      .find((p) => containsWords(text, p.name)) ?? null;

  const direction: "in" | "out" =
    sign === "+" ? "in" : sign === "-" ? "out" : (payee?.defaultDirection ?? "out");
  const kind = direction === "in" ? "income" : "expense";

  let categoryId = tagCategory?.id ?? null;
  if (categoryId === null) {
    const word = ctx.categories
      .filter((c) => c.kind === kind)
      .sort((a, b) => b.name.length - a.name.length)
      .find((c) => containsWords(text, c.name));
    categoryId = word?.id ?? payee?.defaultCategoryId ?? null;
  }

  const effectiveDate = date ?? ctx.today;
  const isUpcoming = unpaid || effectiveDate > ctx.today;
  const status = isUpcoming ? "upcoming" : direction === "in" ? "received" : "paid";

  const catName = ctx.categories.find((c) => c.id === categoryId)?.name;
  const title = text || payee?.name || catName || (direction === "in" ? "Income" : "Expense");

  return {
    direction,
    amount,
    title: title.charAt(0).toUpperCase() + title.slice(1),
    date: effectiveDate,
    dueDate: unpaid && direction === "out" ? effectiveDate : null,
    status,
    payeeId: payee?.id ?? null,
    categoryId,
    accountId: payee?.defaultAccountId ?? null,
  };
}
