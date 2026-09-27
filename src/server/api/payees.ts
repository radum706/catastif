import { asc, eq } from "drizzle-orm";
import { z } from "zod";
import { db } from "@/server/db/client";
import { payees, type Workspace } from "@/server/db/schema";
import { notFound } from "./errors";
import * as s from "./schemas";
import { assertAccountIn, assertCategoryIn } from "./workspace";

export const createPayeeInput = z.object({
  name: s.name,
  workspace: s.workspace,
  defaultDirection: s.direction.nullish(),
  defaultCategoryId: s.optionalId,
  defaultAccountId: s.optionalId,
  notes: s.notes,
});

export const updatePayeeInput = createPayeeInput.omit({ workspace: true }).partial().extend({
  id: s.id,
  archived: z.boolean().optional(),
});

export async function listPayees(opts: { workspace?: Workspace; includeArchived?: boolean } = {}) {
  const rows = await db
    .select()
    .from(payees)
    .where(opts.workspace ? eq(payees.workspace, opts.workspace) : undefined)
    .orderBy(asc(payees.name));
  return opts.includeArchived ? rows : rows.filter((p) => !p.archived);
}

export async function getPayee(payeeId: number) {
  const [row] = await db.select().from(payees).where(eq(payees.id, payeeId));
  return row ?? notFound("Payee");
}

export async function createPayee(input: z.input<typeof createPayeeInput>) {
  const data = createPayeeInput.parse(input);
  await assertCategoryIn(data.defaultCategoryId, data.workspace);
  await assertAccountIn(data.defaultAccountId, data.workspace);
  const [row] = await db.insert(payees).values(data).returning();
  return row;
}

export async function updatePayee(input: z.input<typeof updatePayeeInput>) {
  const { id, ...data } = updatePayeeInput.parse(input);
  const current = await getPayee(id);
  await assertCategoryIn(data.defaultCategoryId, current.workspace);
  await assertAccountIn(data.defaultAccountId, current.workspace);
  const [row] = await db.update(payees).set(data).where(eq(payees.id, id)).returning();
  return row;
}

export async function deletePayee(payeeId: number) {
  await db.delete(payees).where(eq(payees.id, payeeId));
}
