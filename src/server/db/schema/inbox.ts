import { index, integer, jsonb, pgEnum, pgTable, text, timestamp } from "drizzle-orm/pg-core";
import { workspaceEnum } from "./common";

export const inboxSourceEnum = pgEnum("inbox_source", ["manual", "phone", "email", "n8n", "api", "chat"]);
export const inboxKindEnum = pgEnum("inbox_kind", ["task", "transaction", "unknown"]);
export const inboxStatusEnum = pgEnum("inbox_status", ["pending", "approved", "rejected"]);

/**
 * Anything captured from outside or drafted by AI lands here first.
 * It only becomes a real task/transaction when you approve it.
 */
export const inboxItems = pgTable(
  "inbox_items",
  {
    id: integer("id").primaryKey().generatedAlwaysAsIdentity(),
    source: inboxSourceEnum("source").notNull().default("manual"),
    /** Hint from the sender; the draft may still pick the other workspace. */
    workspace: workspaceEnum("workspace"),
    rawText: text("raw_text").notNull(),
    kind: inboxKindEnum("kind").notNull().default("unknown"),
    draft: jsonb("draft").$type<Record<string, unknown>>(),
    /** e.g. "anthropic:claude-haiku-4-5" or "parser". */
    extractor: text("extractor"),
    error: text("error"),
    status: inboxStatusEnum("status").notNull().default("pending"),
    resultType: text("result_type"),
    resultId: integer("result_id"),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    resolvedAt: timestamp("resolved_at", { withTimezone: true }),
  },
  (t) => [index("inbox_items_status_idx").on(t.status, t.createdAt)],
);

export type InboxItem = typeof inboxItems.$inferSelect;
