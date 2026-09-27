import { integer, pgTable, text, timestamp } from "drizzle-orm/pg-core";

// Single user. The table exists so the password hash lives in the DB, not in .env.
export const appUser = pgTable("app_user", {
  id: integer("id").primaryKey().generatedAlwaysAsIdentity(),
  passwordHash: text("password_hash").notNull(),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
});

export const sessions = pgTable("sessions", {
  // sha256 of the cookie token; the raw token is never stored.
  id: text("id").primaryKey(),
  userId: integer("user_id")
    .notNull()
    .references(() => appUser.id, { onDelete: "cascade" }),
  expiresAt: timestamp("expires_at", { withTimezone: true }).notNull(),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  userAgent: text("user_agent"),
});
