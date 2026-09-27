import { pgEnum, timestamp } from "drizzle-orm/pg-core";

/** Work and personal are separate worlds; every record lives in exactly one. */
export const workspaceEnum = pgEnum("workspace", ["personal", "work"]);
export type Workspace = (typeof workspaceEnum.enumValues)[number];

export const timestamps = {
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true })
    .notNull()
    .defaultNow()
    .$onUpdate(() => new Date()),
};
