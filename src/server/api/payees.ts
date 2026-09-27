import { asc, eq } from "drizzle-orm";
import { z } from "zod";
import { db } from "@/server/db/client";
import { payees } from "@/server/db/schema";
import { notFound } from "./errors";
import * as s from "./schemas";

export const createPayeeInput = z.object({
  name: s.name,
  defaultDirection: s.direction.nullish(),
  defaultCategoryId: s.optionalId,
  defaultAccountId: s.optionalId,
  defaultContext: s.context.nullish(),
  notes: s.notes,
});

export const updatePayeeInput = createPayeeInput.partial().extend({
  id: s.id,
  archived: z.boolean().optional(),
});

export async function listPayees(opts: { includeArchived?: boolean } = {}) {
  const rows = await db.select().from(payees).orderBy(asc(payees.name));
  return opts.includeArchived ? rows : rows.filter((p) => !p.archived);
}

export async function createPayee(input: z.input<typeof createPayeeInput>) {
  const data = createPayeeInput.parse(input);
  const [row] = await db.insert(payees).values(data).returning();
  return row;
}

export async function updatePayee(input: z.input<typeof updatePayeeInput>) {
  const { id, ...data } = updatePayeeInput.parse(input);
  const [row] = await db.update(payees).set(data).where(eq(payees.id, id)).returning();
  return row ?? notFound("Payee");
}

export async function deletePayee(payeeId: number) {
  await db.delete(payees).where(eq(payees.id, payeeId));
}
