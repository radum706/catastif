import { asc, eq } from "drizzle-orm";
import { z } from "zod";
import { db } from "@/server/db/client";
import { categories } from "@/server/db/schema";
import { invalid, notFound } from "./errors";
import * as s from "./schemas";

export const createCategoryInput = z.object({
  name: s.name,
  kind: s.categoryKind,
  parentId: s.optionalId,
});

export const updateCategoryInput = z.object({
  id: s.id,
  name: s.name.optional(),
  parentId: s.optionalId,
  archived: z.boolean().optional(),
});

export async function listCategories(opts: { includeArchived?: boolean } = {}) {
  const rows = await db
    .select()
    .from(categories)
    .orderBy(asc(categories.kind), asc(categories.name));
  return opts.includeArchived ? rows : rows.filter((c) => !c.archived);
}

async function checkParent(parentId: number | null | undefined, kind: string, selfId?: number) {
  if (!parentId) return;
  if (parentId === selfId) invalid("A category cannot be its own parent");
  const [parent] = await db.select().from(categories).where(eq(categories.id, parentId));
  if (!parent) notFound("Parent category");
  if (parent.kind !== kind) invalid("Parent must be the same kind (income/expense)");
  if (parent.parentId) invalid("Only one level of sub-categories is supported");
}

export async function createCategory(input: z.input<typeof createCategoryInput>) {
  const data = createCategoryInput.parse(input);
  await checkParent(data.parentId, data.kind);
  const [row] = await db.insert(categories).values(data).returning();
  return row;
}

export async function updateCategory(input: z.input<typeof updateCategoryInput>) {
  const { id, ...data } = updateCategoryInput.parse(input);
  const [current] = await db.select().from(categories).where(eq(categories.id, id));
  if (!current) notFound("Category");
  await checkParent(data.parentId, current.kind, id);
  const [row] = await db.update(categories).set(data).where(eq(categories.id, id)).returning();
  return row;
}

/** Transactions keep existing; their category becomes empty. */
export async function deleteCategory(categoryId: number) {
  await db.delete(categories).where(eq(categories.id, categoryId));
}

export const DEFAULT_CATEGORIES: { name: string; kind: "income" | "expense" }[] = [
  { name: "Salary", kind: "income" },
  { name: "Client work", kind: "income" },
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
  { name: "Taxes", kind: "expense" },
  { name: "Materials", kind: "expense" },
  { name: "Tools", kind: "expense" },
  { name: "Other", kind: "expense" },
];

/** Adds the starter set; existing names are left alone. */
export async function seedDefaultCategories() {
  await db.insert(categories).values(DEFAULT_CATEGORIES).onConflictDoNothing();
}
