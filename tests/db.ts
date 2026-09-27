import { drizzle } from "drizzle-orm/postgres-js";
import { migrate } from "drizzle-orm/postgres-js/migrator";
import postgres from "postgres";
import { sql } from "drizzle-orm";
import { db } from "@/server/db/client";

export const hasDb = !!process.env.DATABASE_URL;

let migrated = false;
export async function resetDb() {
  if (!migrated) {
    const client = postgres(process.env.DATABASE_URL!, { max: 1, onnotice: () => {} });
    await migrate(drizzle(client), { migrationsFolder: "./drizzle" });
    await client.end();
    migrated = true;
  }
  await db.execute(
    sql`truncate task_activity, task_tags, tags, tasks, sections, projects, transactions, transfers, recurring_rules, payees, categories, accounts, sessions, app_user restart identity cascade`,
  );
}
