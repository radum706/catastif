// Applies committed migrations. Runs on app container start.
// Waits up to ~60 s for the database and explains common setup mistakes.
import { drizzle } from "drizzle-orm/postgres-js";
import { migrate } from "drizzle-orm/postgres-js/migrator";
import { connect, explainDbError, rootError } from "../src/server/db/connection";

const RETRYABLE = new Set(["ECONNREFUSED", "EHOSTUNREACH", "ENOTFOUND", "EAI_AGAIN", "57P03", "ETIMEDOUT", "CONNECT_TIMEOUT"]);

async function main() {
  const folder = process.env.MIGRATIONS_DIR ?? "./drizzle";
  for (let attempt = 1; ; attempt++) {
    const client = connect({ max: 1, onnotice: () => {}, connect_timeout: 10 });
    try {
      await migrate(drizzle(client), { migrationsFolder: folder });
      await client.end();
      console.log("migrations applied");
      return;
    } catch (err) {
      await client.end({ timeout: 1 }).catch(() => {});
      const root = rootError(err);
      const code = root.code ?? "";
      if (RETRYABLE.has(code) && attempt < 12) {
        console.log(`[migrate] database not ready (${code}), retrying in 5 s (${attempt}/12)`);
        await new Promise((r) => setTimeout(r, 5000));
        continue;
      }
      const hint = explainDbError(err);
      console.error(`[migrate] FAILED: ${root.message ?? (err as Error).message}`);
      if (hint) console.error(`[migrate] ${hint}`);
      process.exit(1);
    }
  }
}

void main();
