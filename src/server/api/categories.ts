import { and, asc, eq } from "drizzle-orm";
import { z } from "zod";
import { db } from "@/server/db/client";
import { categories, type Workspace } from "@/server/db/schema";
import { invalid, notFound } from "./errors";
import * as s from "./schemas";

export const createCategoryInput = z.object({
  name: s.name,
  kind: s.categoryKind,
  workspace: s.workspace,
  parentId: s.optionalId,
});

export const updateCategoryInput = z.object({
  id: s.id,
  name: s.name.optional(),
  parentId: s.optionalId,
  archived: z.boolean().optional(),
});

export async function listCategories(opts: { workspace?: Workspace; includeArchived?: boolean } = {}) {
  const rows = await db
    .select()
    .from(categories)
    .where(opts.workspace ? eq(categories.workspace, opts.workspace) : undefined)
    .orderBy(asc(categories.kind), asc(categories.name));
  return opts.includeArchived ? rows : rows.filter((c) => !c.archived);
}

async function checkParent(parentId: number | null | undefined, kind: string, workspace: string, selfId?: number) {
  if (!parentId) return;
  if (parentId === selfId) invalid("A category cannot be its own parent");
  const [parent] = await db.select().from(categories).where(eq(categories.id, parentId));
  if (!parent) notFound("Parent category");
  if (parent.kind !== kind) invalid("Parent must be the same kind (income/expense)");
  if (parent.workspace !== workspace) invalid("Parent belongs to the other workspace");
  if (parent.parentId) invalid("Only one level of sub-categories is supported");
}

export async function createCategory(input: z.input<typeof createCategoryInput>) {
  const data = createCategoryInput.parse(input);
  await checkParent(data.parentId, data.kind, data.workspace);
  const [row] = await db.insert(categories).values(data).returning();
  return row;
}

export async function updateCategory(input: z.input<typeof updateCategoryInput>) {
  const { id, ...data } = updateCategoryInput.parse(input);
  const [current] = await db.select().from(categories).where(eq(categories.id, id));
  if (!current) notFound("Category");
  await checkParent(data.parentId, current.kind, current.workspace, id);
  const [row] = await db.update(categories).set(data).where(eq(categories.id, id)).returning();
  return row;
}

/** Transactions keep existing; their category becomes empty. */
export async function deleteCategory(categoryId: number) {
  await db.delete(categories).where(eq(categories.id, categoryId));
}

type Seed = { name: string; kind: "income" | "expense" };

export const DEFAULT_CATEGORIES: Record<Workspace, Seed[]> = {
  personal: [
    { name: "Salary", kind: "income" },
    { name: "Other income", kind: "income" },
    { name: "Rent", kind: "expense" },
    { name: "Utilities", kind: "expense" },
    { name: "Groceries", kind: "expense" },
    { name: "Eating out", kind: "expense" },
    { name: "Transport", kind: "expense" },
    { name: "Car", kind: "expense" },
    { name: "Health", kind: "expense" },
    { name: "Insurance", kind: "expense" },
    { name: "Subscriptions", kind: "expense" },
    { name: "Phone & internet", kind: "expense" },
    { name: "Home", kind: "expense" },
    { name: "Other", kind: "expense" },
  ],
  work: [
    { name: "Client work", kind: "income" },
    { name: "Other income", kind: "income" },
    { name: "Materials", kind: "expense" },
    { name: "Tools & equipment", kind: "expense" },
    { name: "Subcontractors", kind: "expense" },
    { name: "Fuel & travel", kind: "expense" },
    { name: "Software", kind: "expense" },
    { name: "Accounting & legal", kind: "expense" },
    { name: "Taxes", kind: "expense" },
    { name: "Bank fees", kind: "expense" },
    { name: "Other", kind: "expense" },
  ],
};

/** Adds the starter set for a workspace; existing names are left alone. */
export async function seedDefaultCategories(workspace: Workspace) {
  await db
    .insert(categories)
    .values(DEFAULT_CATEGORIES[workspace].map((c) => ({ ...c, workspace })))
    .onConflictDoNothing();
}

export async function getCategory(categoryId: number) {
  const [row] = await db.select().from(categories).where(and(eq(categories.id, categoryId)));
  return row ?? notFound("Category");
}
