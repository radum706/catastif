// Identifiers that must never be sent to an external model.

const PATTERNS: [RegExp, string][] = [
  // IBAN (RO49AAAA1B31007593840000, FR76 3000 6000 0112 3456 7890 189 …)
  [/\b[A-Z]{2}\d{2}(?:[ ]?[A-Z0-9]{4}){2,7}(?:[ ]?[A-Z0-9]{1,4})?\b/g, "[IBAN]"],
  // Romanian CNP / French NIR-like long ids
  [/\b\d{13,15}\b/g, "[ID]"],
  // Card numbers: 13–19 digits, optionally grouped
  [/\b(?:\d[ -]?){12,18}\d\b/g, "[NUMBER]"],
  // e-mail addresses
  [/\b[\w.+-]+@[\w-]+\.[\w.-]+\b/g, "[EMAIL]"],
  // Phone numbers (+40 7xx xxx xxx, 07xx…, +33 6 …)
  [/(?:\+\d{2}[ ]?|\b0)\d(?:[ .-]?\d){7,10}\b/g, "[PHONE]"],
];

export function redact(text: string): string {
  let out = text;
  for (const [re, label] of PATTERNS) out = out.replace(re, label);
  return out;
}
