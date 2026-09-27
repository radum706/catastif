import { sql } from "drizzle-orm";
import {
  bigint,
  boolean,
  check,
  date,
  foreignKey,
  index,
  integer,
  pgEnum,
  pgTable,
  text,
  timestamp,
  unique,
  uniqueIndex,
  type AnyPgColumn,
} from "drizzle-orm/pg-core";

export const currencyEnum = pgEnum("currency", ["EUR", "RON"]);
export const accountTypeEnum = pgEnum("account_type", ["bank", "cash", "card", "other"]);
export const directionEnum = pgEnum("direction", ["in", "out"]);
export const txStatusEnum = pgEnum("tx_status", ["upcoming", "invoiced", "paid", "received"]);
export const contextEnum = pgEnum("context", ["personal", "work"]);
export const categoryKindEnum = pgEnum("category_kind", ["income", "expense"]);
export const frequencyEnum = pgEnum("frequency", ["daily", "weekly", "monthly", "yearly"]);

// Amounts are always minor units (cents / bani). mode "number" is exact up to 2^53.
const money = (name: string) => bigint(name, { mode: "number" });
const day = (name: string) => date(name, { mode: "string" });
const timestamps = {
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true })
    .notNull()
    .defaultNow()
    .$onUpdate(() => new Date()),
};

export const accounts = pgTable(
  "accounts",
  {
    id: integer("id").primaryKey().generatedAlwaysAsIdentity(),
    name: text("name").notNull(),
    type: accountTypeEnum("type").notNull().default("bank"),
    currency: currencyEnum("currency").notNull(),
    openingBalance: money("opening_balance").notNull().default(0),
    openingDate: day("opening_date").notNull().default(sql`current_date`),
    context: contextEnum("context").notNull().default("personal"),
    archived: boolean("archived").notNull().default(false),
    notes: text("notes"),
    ...timestamps,
  },
  (t) => [unique("accounts_id_currency_uq").on(t.id, t.currency)],
);

export const categories = pgTable(
  "categories",
  {
    id: integer("id").primaryKey().generatedAlwaysAsIdentity(),
    name: text("name").notNull(),
    kind: categoryKindEnum("kind").notNull(),
    parentId: integer("parent_id").references((): AnyPgColumn => categories.id, {
      onDelete: "set null",
    }),
    archived: boolean("archived").notNull().default(false),
    ...timestamps,
  },
  (t) => [uniqueIndex("categories_kind_name_uq").on(t.kind, sql`lower(${t.name})`)],
);

export const payees = pgTable(
  "payees",
  {
    id: integer("id").primaryKey().generatedAlwaysAsIdentity(),
    name: text("name").notNull(),
    defaultDirection: directionEnum("default_direction"),
    defaultCategoryId: integer("default_category_id").references(() => categories.id, {
      onDelete: "set null",
    }),
    defaultAccountId: integer("default_account_id").references(() => accounts.id, {
      onDelete: "set null",
    }),
    defaultContext: contextEnum("default_context"),
    archived: boolean("archived").notNull().default(false),
    notes: text("notes"),
    ...timestamps,
  },
  (t) => [uniqueIndex("payees_name_uq").on(sql`lower(${t.name})`)],
);

export const transfers = pgTable("transfers", {
  id: integer("id").primaryKey().generatedAlwaysAsIdentity(),
  date: day("date").notNull(),
  note: text("note"),
  ...timestamps,
});

export const recurringRules = pgTable(
  "recurring_rules",
  {
    id: integer("id").primaryKey().generatedAlwaysAsIdentity(),
    title: text("title").notNull(),
    direction: directionEnum("direction").notNull(),
    amount: money("amount").notNull(),
    currency: currencyEnum("currency").notNull(),
    accountId: integer("account_id").notNull(),
    categoryId: integer("category_id").references(() => categories.id, { onDelete: "set null" }),
    payeeId: integer("payee_id").references(() => payees.id, { onDelete: "set null" }),
    context: contextEnum("context").notNull().default("personal"),
    frequency: frequencyEnum("frequency").notNull().default("monthly"),
    interval: integer("interval").notNull().default(1),
    startDate: day("start_date").notNull(),
    endDate: day("end_date"),
    // When set, each generated entry is a bill due this many days after its date.
    dueOffsetDays: integer("due_offset_days"),
    active: boolean("active").notNull().default(true),
    // Last date up to which planned transactions have been materialised.
    generatedUntil: day("generated_until"),
    notes: text("notes"),
    ...timestamps,
  },
  (t) => [
    foreignKey({
      name: "recurring_rules_account_currency_fk",
      columns: [t.accountId, t.currency],
      foreignColumns: [accounts.id, accounts.currency],
    }).onDelete("cascade"),
    check("recurring_rules_amount_positive", sql`${t.amount} > 0`),
    check("recurring_rules_interval_positive", sql`${t.interval} >= 1`),
    check(
      "recurring_rules_end_after_start",
      sql`${t.endDate} is null or ${t.endDate} >= ${t.startDate}`,
    ),
  ],
);

export const transactions = pgTable(
  "transactions",
  {
    id: integer("id").primaryKey().generatedAlwaysAsIdentity(),
    title: text("title").notNull(),
    direction: directionEnum("direction").notNull(),
    amount: money("amount").notNull(),
    currency: currencyEnum("currency").notNull(),
    accountId: integer("account_id").notNull(),
    status: txStatusEnum("status").notNull(),
    // Cash date: when the money moved (settled) or is expected to move (open).
    date: day("date").notNull(),
    dueDate: day("due_date"),
    invoicedAt: day("invoiced_at"),
    settledAt: day("settled_at"),
    categoryId: integer("category_id").references(() => categories.id, { onDelete: "set null" }),
    payeeId: integer("payee_id").references(() => payees.id, { onDelete: "set null" }),
    context: contextEnum("context").notNull().default("personal"),
    recurringRuleId: integer("recurring_rule_id").references(() => recurringRules.id, {
      onDelete: "set null",
    }),
    occurrenceDate: day("occurrence_date"),
    transferId: integer("transfer_id").references(() => transfers.id, { onDelete: "cascade" }),
    // FKs added in Phase 2 when projects/tasks exist.
    projectId: integer("project_id"),
    taskId: integer("task_id"),
    notes: text("notes"),
    ...timestamps,
  },
  (t) => [
    foreignKey({
      name: "transactions_account_currency_fk",
      columns: [t.accountId, t.currency],
      foreignColumns: [accounts.id, accounts.currency],
    }).onDelete("cascade"),
    check("transactions_amount_positive", sql`${t.amount} > 0`),
    check(
      "transactions_status_matches_direction",
      sql`(${t.direction} = 'out' and ${t.status} in ('upcoming', 'paid'))
       or (${t.direction} = 'in' and ${t.status} in ('upcoming', 'invoiced', 'received'))`,
    ),
    check(
      "transactions_settled_has_date",
      sql`(${t.status} in ('paid', 'received')) = (${t.settledAt} is not null)`,
    ),
    unique("transactions_rule_occurrence_uq").on(t.recurringRuleId, t.occurrenceDate),
    index("transactions_account_date_idx").on(t.accountId, t.date),
    index("transactions_status_idx").on(t.status),
    index("transactions_due_date_idx").on(t.dueDate),
    index("transactions_transfer_idx").on(t.transferId),
  ],
);

export type Currency = (typeof currencyEnum.enumValues)[number];
export type Direction = (typeof directionEnum.enumValues)[number];
export type TxStatus = (typeof txStatusEnum.enumValues)[number];
export type Context = (typeof contextEnum.enumValues)[number];
export type Frequency = (typeof frequencyEnum.enumValues)[number];
export type AccountType = (typeof accountTypeEnum.enumValues)[number];
export type CategoryKind = (typeof categoryKindEnum.enumValues)[number];

export type Account = typeof accounts.$inferSelect;
export type Category = typeof categories.$inferSelect;
export type Payee = typeof payees.$inferSelect;
export type Transaction = typeof transactions.$inferSelect;
export type RecurringRule = typeof recurringRules.$inferSelect;
