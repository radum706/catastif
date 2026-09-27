import { ZodError } from "zod";
import { ApiError } from "@/server/api/errors";
import { parseAmount } from "@/lib/money";
import { t } from "@/i18n";

export type ActionState = { error?: string; message?: string; ts?: number } | null;

export class FormError extends Error {}

export const str = (fd: FormData, k: string) => String(fd.get(k) ?? "").trim();
export const optStr = (fd: FormData, k: string) => str(fd, k) || null;
export const optInt = (fd: FormData, k: string) => {
  const v = str(fd, k);
  return v === "" ? null : Number(v);
};
export const int = (fd: FormData, k: string) => Number(str(fd, k));
export const bool = (fd: FormData, k: string) => fd.get(k) === "on" || fd.get(k) === "true";
export const optDate = (fd: FormData, k: string) => str(fd, k) || undefined;

/** Positive amount in minor units. */
export function money(fd: FormData, k: string): number {
  const v = parseAmount(str(fd, k));
  if (v === null || v <= 0) throw new FormError(t.errors.invalidAmount);
  return v;
}

/** Signed amount (e.g. opening balance), empty → 0. */
export function signedMoney(fd: FormData, k: string): number {
  const raw = str(fd, k);
  if (!raw) return 0;
  const neg = raw.startsWith("-");
  const v = parseAmount(neg ? raw.slice(1) : raw);
  if (v === null) throw new FormError(t.errors.invalidAmount);
  return neg ? -v : v;
}

/** Only same-site relative paths. */
export function safeReturnTo(fd: FormData, fallback: string): string {
  const v = str(fd, "returnTo");
  return v.startsWith("/") && !v.startsWith("//") ? v : fallback;
}

export function errorMessage(err: unknown): string {
  if (err instanceof FormError || err instanceof ApiError) return err.message;
  if (err instanceof ZodError) {
    return err.issues.map((i) => (i.path.length ? `${i.path.join(".")}: ${i.message}` : i.message)).join("; ");
  }
  const pgMessage = (err as { cause?: { constraint_name?: string }; constraint_name?: string }) ?? {};
  const constraint = pgMessage.constraint_name ?? pgMessage.cause?.constraint_name;
  if (constraint?.endsWith("_uq")) return "That name already exists.";
  if (constraint) return `Rejected by the database (${constraint}).`;
  console.error(err);
  return t.errors.generic;
}
