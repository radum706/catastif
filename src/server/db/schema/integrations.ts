import { sql } from "drizzle-orm";
import { boolean, index, integer, jsonb, pgEnum, pgTable, text, timestamp } from "drizzle-orm/pg-core";
import { workspaceEnum } from "./common";

export const TOKEN_SCOPES = ["read", "write", "inbox", "calendar"] as const;
export type TokenScope = (typeof TOKEN_SCOPES)[number];

/** Bearer tokens for n8n, phone shortcuts, calendar apps. Only a hash is stored. */
export const apiTokens = pgTable("api_tokens", {
  id: integer("id").primaryKey().generatedAlwaysAsIdentity(),
  name: text("name").notNull(),
  prefix: text("prefix").notNull(),
  tokenHash: text("token_hash").notNull().unique(),
  scopes: text("scopes").array().notNull().$type<TokenScope[]>(),
  /** null = both workspaces. */
  workspace: workspaceEnum("workspace"),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  lastUsedAt: timestamp("last_used_at", { withTimezone: true }),
  revokedAt: timestamp("revoked_at", { withTimezone: true }),
});

export const WEBHOOK_EVENTS = [
  "task.created",
  "task.updated",
  "task.completed",
  "task.reopened",
  "task.deleted",
  "project.created",
  "transaction.created",
  "transaction.updated",
  "transaction.settled",
  "transaction.deleted",
  "bill.overdue",
  "task.overdue",
  "inbox.created",
  "inbox.approved",
  "ping",
] as const;
export type WebhookEvent = (typeof WEBHOOK_EVENTS)[number];

/** Outgoing webhooks, e.g. to an n8n Webhook node. Signed with HMAC-SHA256. */
export const webhooks = pgTable("webhooks", {
  id: integer("id").primaryKey().generatedAlwaysAsIdentity(),
  name: text("name").notNull(),
  url: text("url").notNull(),
  secret: text("secret").notNull(),
  /** Event names, or "*" for all. */
  events: text("events").array().notNull().$type<string[]>(),
  workspace: workspaceEnum("workspace"),
  active: boolean("active").notNull().default(true),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  lastStatus: integer("last_status"),
  lastError: text("last_error"),
  lastDeliveredAt: timestamp("last_delivered_at", { withTimezone: true }),
});

export const deliveryStatusEnum = pgEnum("delivery_status", ["pending", "delivered", "failed"]);

/** Outbox: rows are written with the change, the worker sends them with retries. */
export const webhookDeliveries = pgTable(
  "webhook_deliveries",
  {
    id: integer("id").primaryKey().generatedAlwaysAsIdentity(),
    webhookId: integer("webhook_id")
      .notNull()
      .references(() => webhooks.id, { onDelete: "cascade" }),
    event: text("event").notNull(),
    payload: jsonb("payload").notNull().$type<Record<string, unknown>>(),
    status: deliveryStatusEnum("status").notNull().default("pending"),
    attempts: integer("attempts").notNull().default(0),
    nextAttemptAt: timestamp("next_attempt_at", { withTimezone: true }).notNull().defaultNow(),
    responseStatus: integer("response_status"),
    error: text("error"),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    deliveredAt: timestamp("delivered_at", { withTimezone: true }),
  },
  (t) => [
    index("webhook_deliveries_due_idx").on(t.nextAttemptAt).where(sql`${t.status} = 'pending'`),
    index("webhook_deliveries_webhook_idx").on(t.webhookId, t.createdAt),
  ],
);

export type ApiToken = typeof apiTokens.$inferSelect;
export type Webhook = typeof webhooks.$inferSelect;
export type WebhookDelivery = typeof webhookDeliveries.$inferSelect;
