import { z } from "zod";
import { isISODate } from "@/lib/dates";

export const isoDate = z.string().refine(isISODate, "Invalid date (YYYY-MM-DD)");
export const id = z.coerce.number().int().positive();
export const optionalId = id.nullish();
/** Minor units, strictly positive. */
export const amount = z.number().int().positive().max(Number.MAX_SAFE_INTEGER);
export const currency = z.enum(["EUR", "RON"]);
export const direction = z.enum(["in", "out"]);
export const context = z.enum(["personal", "work"]);
export const txStatus = z.enum(["upcoming", "invoiced", "paid", "received"]);
export const frequency = z.enum(["daily", "weekly", "monthly", "yearly"]);
export const accountType = z.enum(["bank", "cash", "card", "other"]);
export const categoryKind = z.enum(["income", "expense"]);
export const name = z.string().trim().min(1).max(200);
export const notes = z.string().trim().max(5000).nullish();
