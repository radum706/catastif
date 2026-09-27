import { drizzle } from "drizzle-orm/postgres-js";
import postgres from "postgres";
import * as schema from "./schema";

function createDb(url: string) {
  const client = postgres(url, { max: 10 });
  return { client, db: drizzle(client, { schema }) };
}

type DbBundle = ReturnType<typeof createDb>;
const globalForDb = globalThis as unknown as { __catastifDb?: DbBundle };

function bundle(): DbBundle {
  if (!globalForDb.__catastifDb) {
    const url = process.env.DATABASE_URL;
    if (!url) throw new Error("DATABASE_URL is not set");
    globalForDb.__catastifDb = createDb(url);
  }
  return globalForDb.__catastifDb;
}

// Lazy so `next build` does not need a database.
export const db = new Proxy({} as DbBundle["db"], {
  get: (_t, prop) => Reflect.get(bundle().db, prop),
});

export type Db = DbBundle["db"];
export type Tx = Parameters<Parameters<Db["transaction"]>[0]>[0];

export async function closeDb() {
  await globalForDb.__catastifDb?.client.end();
  globalForDb.__catastifDb = undefined;
}
