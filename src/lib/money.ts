// Money is always an integer number of minor units (cents / bani) plus a currency.

export const CURRENCIES = ["EUR", "RON"] as const;
export type CurrencyCode = (typeof CURRENCIES)[number];

/**
 * Parses user input into minor units. Accepts "45", "45.5", "45,50", "1 234,56",
 * "1,234.56", "1.234,56". Returns null for anything that isn't a positive-or-zero amount.
 */
export function parseAmount(input: string): number | null {
  let s = input.trim().replace(/[\s ']/g, "");
  if (!s || !/^\d[\d.,]*$/.test(s)) return null;

  const lastDot = s.lastIndexOf(".");
  const lastComma = s.lastIndexOf(",");
  const lastSep = Math.max(lastDot, lastComma);

  if (lastSep !== -1) {
    const decimals = s.length - lastSep - 1;
    const sepChar = s[lastSep];
    const sepCount = s.split(sepChar).length - 1;
    const otherSep = sepChar === "." ? "," : ".";
    const isDecimal =
      decimals > 0 && decimals <= 2 && (sepCount === 1 || s.includes(otherSep));
    if (isDecimal) {
      const intPart = s.slice(0, lastSep).replace(/[.,]/g, "");
      const frac = s.slice(lastSep + 1).padEnd(2, "0");
      s = `${intPart || "0"}.${frac}`;
    } else {
      // Only thousand separators, e.g. "1.234" or "1,234,567".
      if (decimals !== 3) return null;
      s = s.replace(/[.,]/g, "");
    }
  }

  const [int, frac = "00"] = s.split(".");
  const value = Number(int) * 100 + Number(frac);
  return Number.isSafeInteger(value) ? value : null;
}

export function formatMoney(minor: number, currency: CurrencyCode, locale = "en-GB"): string {
  return new Intl.NumberFormat(locale, {
    style: "currency",
    currency,
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  }).format(minor / 100);
}

/** Plain decimal string for form inputs, e.g. 123456 → "1234.56". */
export function minorToInput(minor: number): string {
  const sign = minor < 0 ? "-" : "";
  const abs = Math.abs(minor);
  return `${sign}${Math.floor(abs / 100)}.${String(abs % 100).padStart(2, "0")}`;
}

export function signed(amount: number, direction: "in" | "out"): number {
  return direction === "in" ? amount : -amount;
}
