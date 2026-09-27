import { describe, expect, it } from "vitest";
import { addDays, addMonths, daysBetween, endOfMonth, isISODate, today } from "@/lib/dates";
import { occurrencesBetween } from "@/lib/recurrence";

describe("dates", () => {
  it("adds months with end-of-month clamping", () => {
    expect(addMonths("2026-01-31", 1)).toBe("2026-02-28");
    expect(addMonths("2028-01-31", 1)).toBe("2028-02-29");
    expect(addMonths("2026-11-15", 3)).toBe("2027-02-15");
    expect(addMonths("2026-03-31", -1)).toBe("2026-02-28");
  });

  it("does basic arithmetic", () => {
    expect(addDays("2026-12-31", 1)).toBe("2027-01-01");
    expect(daysBetween("2026-03-28", "2026-03-30")).toBe(2); // across DST
    expect(endOfMonth("2026-02-10")).toBe("2026-02-28");
    expect(isISODate("2026-02-30")).toBe(false);
  });

  it("uses the app timezone for today", () => {
    // 23:30 UTC on Sep 30 is already Oct 1 in Bucharest.
    expect(today("Europe/Bucharest", new Date("2026-09-30T23:30:00Z"))).toBe("2026-10-01");
    expect(today("UTC", new Date("2026-09-30T23:30:00Z"))).toBe("2026-09-30");
  });
});

describe("recurrence", () => {
  it("monthly on the 31st keeps coming back to the month end", () => {
    const spec = { frequency: "monthly" as const, interval: 1, startDate: "2026-01-31" };
    expect(occurrencesBetween(spec, "2026-01-01", "2026-05-01")).toEqual([
      "2026-01-31",
      "2026-02-28",
      "2026-03-31",
      "2026-04-30",
    ]);
  });

  it("respects from, end date and interval", () => {
    const spec = { frequency: "weekly" as const, interval: 2, startDate: "2026-01-05", endDate: "2026-02-28" };
    expect(occurrencesBetween(spec, "2026-01-20", "2026-12-31")).toEqual([
      "2026-02-02",
      "2026-02-16",
    ]);
  });

  it("yearly and daily", () => {
    expect(
      occurrencesBetween({ frequency: "yearly", interval: 1, startDate: "2024-02-29" }, "2025-01-01", "2028-12-31"),
    ).toEqual(["2025-02-28", "2026-02-28", "2027-02-28", "2028-02-29"]);
    expect(
      occurrencesBetween({ frequency: "daily", interval: 3, startDate: "2026-01-01" }, "2026-01-05", "2026-01-12"),
    ).toEqual(["2026-01-07", "2026-01-10"]);
  });

  it("returns nothing before the start", () => {
    expect(
      occurrencesBetween({ frequency: "monthly", interval: 1, startDate: "2027-01-01" }, "2026-01-01", "2026-12-31"),
    ).toEqual([]);
  });
});
