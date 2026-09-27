import { en } from "./en";

// Single locale for now. Later: pick by user setting and return the matching dictionary.
export const t = en;

/** Fills {placeholders}: fmt(t.bills.dueIn, { n: 3 }). */
export function fmt(template: string, vars: Record<string, string | number>): string {
  return template.replace(/\{(\w+)\}/g, (_, k) => String(vars[k] ?? `{${k}}`));
}
