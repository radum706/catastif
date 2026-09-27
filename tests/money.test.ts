import { describe, expect, it } from "vitest";
import { formatMoney, minorToInput, parseAmount } from "@/lib/money";

describe("parseAmount", () => {
  it.each([
    ["45", 4500],
    ["45.5", 4550],
    ["45,50", 4550],
    ["0.05", 5],
    ["1 234,56", 123456],
    ["1,234.56", 123456],
    ["1.234,56", 123456],
    ["1.234", 123400],
    ["12.345.678", 1234567800],
  ])("%s → %d", (input, expected) => {
    expect(parseAmount(input)).toBe(expected);
  });

  it.each(["", "abc", "-5", "1.2.3", "1,23,4"])("rejects %s", (input) => {
    expect(parseAmount(input)).toBeNull();
  });
});

describe("formatting", () => {
  it("formats minor units", () => {
    expect(formatMoney(123456, "EUR")).toBe("€1,234.56");
    expect(formatMoney(-500, "RON")).toContain("5.00");
    expect(minorToInput(123405)).toBe("1234.05");
  });
});
