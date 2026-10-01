import { drizzle } from "drizzle-orm/postgres-js";
import { connect } from "./connection";
import * as schema from "./schema";

function createDb() {
  const client = connect({ max: 10 });
  return { client, db: drizzle(client, { schema }) };
}

type DbBundle = ReturnType<typeof createDb>;
const globalForDb = globalThis as unknown as { __catastifDb?: DbBundle };

function bundle(): DbBundle {
  if (!globalForDb.__catastifDb) {
    globalForDb.__catastifDb = createDb();
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
