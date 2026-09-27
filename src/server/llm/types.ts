import { z } from "zod";

const iso = z.string().regex(/^\d{4}-\d{2}-\d{2}$/);
const ws = z.enum(["personal", "work"]);

/** What an approved task draft turns into. Stored in inbox_items.draft. */
export const taskDraft = z.object({
  workspace: ws,
  title: z.string().trim().min(1).max(200),
  notes: z.string().max(20_000).nullable().default(null),
  dueDate: iso.nullable().default(null),
  dueTime: z.string().regex(/^\d{2}:\d{2}$/).nullable().default(null),
  priority: z.enum(["none", "low", "medium", "high"]).default("none"),
  projectId: z.number().int().positive().nullable().default(null),
  tags: z.array(z.string().trim().min(1).max(50)).max(20).default([]),
});

/** What an approved transaction draft turns into. Amount in minor units. */
export const transactionDraft = z.object({
  workspace: ws,
  title: z.string().trim().min(1).max(200),
  direction: z.enum(["in", "out"]),
  amount: z.number().int().positive().nullable(),
  accountId: z.number().int().positive().nullable().default(null),
  status: z.enum(["upcoming", "invoiced", "paid", "received"]),
  date: iso,
  dueDate: iso.nullable().default(null),
  categoryId: z.number().int().positive().nullable().default(null),
  payeeId: z.number().int().positive().nullable().default(null),
  notes: z.string().max(5000).nullable().default(null),
});

export type TaskDraft = z.infer<typeof taskDraft>;
export type TransactionDraft = z.infer<typeof transactionDraft>;

export type Extraction =
  | { kind: "task"; draft: TaskDraft }
  | { kind: "transaction"; draft: TransactionDraft }
  | { kind: "unknown"; draft: null };

type Named = { id: number; name: string };

/** Names and ids the model may choose from. Never includes account numbers. */
export type WorkspaceContext = {
  accounts: (Named & { currency: string })[];
  categories: (Named & { kind: "income" | "expense" })[];
  payees: (Named & { defaultDirection: "in" | "out" | null; defaultCategoryId: number | null; defaultAccountId: number | null })[];
  projects: Named[];
};

export type ExtractContext = {
  today: string;
  timeZone: string;
  /** Where the sender thinks it belongs; null = let the extractor decide. */
  workspaceHint: "personal" | "work" | null;
  /** Force a kind (e.g. "turn this into a task"). */
  kind?: "task" | "transaction";
  workspaces: Record<"personal" | "work", WorkspaceContext>;
};

export interface LlmProvider {
  readonly name: string;
  extract(text: string, ctx: ExtractContext): Promise<Extraction>;
}
