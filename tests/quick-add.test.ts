import { describe, expect, it } from "vitest";
import { parseQuickAdd, type QuickAddCategory, type QuickAddPayee } from "@/lib/quick-add";

const today = "2026-09-27";
const payees: QuickAddPayee[] = [
  { id: 1, name: "Lidl", defaultDirection: "out", defaultCategoryId: 3, defaultAccountId: 7 },
  { id: 2, name: "Acme Corp", defaultDirection: "in", defaultCategoryId: 1, defaultAccountId: 8 },
  { id: 3, name: "Enel", defaultDirection: "out", defaultCategoryId: 4, defaultAccountId: null },
];
const categories: QuickAddCategory[] = [
  { id: 1, name: "Salary", kind: "income" },
  { id: 2, name: "Car", kind: "expense" },
  { id: 3, name: "Groceries", kind: "expense" },
  { id: 4, name: "Utilities", kind: "expense" },
  { id: 5, name: "Eating out", kind: "expense" },
];
const parse = (s: string) => parseQuickAdd(s, { today, payees, categories });

describe("parseQuickAdd", () => {
  it("parses a simple expense with a known payee", () => {
    expect(parse("-45 Lidl food")).toMatchObject({
      direction: "out",
      amount: 4500,
      title: "Lidl food",
      status: "paid",
      date: today,
      payeeId: 1,
      categoryId: 3,
      accountId: 7,
    });
  });

  it("parses income and matches a category word", () => {
    expect(parse("+4500 salary")).toMatchObject({
      direction: "in",
      amount: 450000,
      title: "Salary",
      status: "received",
      categoryId: 1,
    });
  });

  it("uses the payee's direction when there is no sign", () => {
    expect(parse("1200,50 Acme Corp september")).toMatchObject({
      direction: "in",
      amount: 120050,
      payeeId: 2,
      accountId: 8,
    });
  });

  it("creates an unpaid bill with a due day", () => {
    expect(parse("-230 Enel unpaid @15")).toMatchObject({
      direction: "out",
      status: "upcoming",
      date: "2026-09-15",
      dueDate: "2026-09-15",
      payeeId: 3,
      categoryId: 4,
    });
  });

  it("handles #category, date words and future dates", () => {
    expect(parse("-60 fuel #car yesterday")).toMatchObject({ categoryId: 2, date: "2026-09-26", status: "paid", title: "Fuel" });
    expect(parse("-80 dinner #eating-out @2026-10-02")).toMatchObject({ categoryId: 5, status: "upcoming", dueDate: null });
  });

  it("reports a missing amount", () => {
    expect(parse("Lidl").amount).toBeNull();
  });
});

import { parseTaskLine } from "@/lib/task-parse";

describe("parseTaskLine", () => {
  // 2026-09-27 is a Sunday.
  it("parses date, time, priority and tags", () => {
    expect(parseTaskLine("call accountant tomorrow 14:00 !high #admin", today)).toEqual({
      title: "Call accountant",
      dueDate: "2026-09-28",
      dueTime: "14:00",
      priority: "high",
      tags: ["admin"],
    });
  });

  it("understands weekdays as the next one", () => {
    expect(parseTaskLine("order tiles fri #site-a", today)).toMatchObject({ dueDate: "2026-10-02", tags: ["site a"] });
    expect(parseTaskLine("gym sunday", today).dueDate).toBe("2026-10-04");
  });

  it("a time alone means today; plain text has no date", () => {
    expect(parseTaskLine("standup 9:30", today)).toMatchObject({ dueDate: today, dueTime: "09:30" });
    expect(parseTaskLine("read book", today)).toMatchObject({ dueDate: null, priority: "none", tags: [] });
  });
});
