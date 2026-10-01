import postgres from "postgres";

/**
 * Database connection settings. DATABASE_URL wins; otherwise the standard PG* variables
 * (PGHOST, PGPORT, PGUSER, PGPASSWORD, PGDATABASE) are used. Compose uses the PG* form so a
 * password with characters like @ / # : doesn't break a URL.
 */
export function connect(opts: postgres.Options<Record<string, never>> = {}) {
  const url = process.env.DATABASE_URL;
  if (url) return postgres(url, opts);
  if (!process.env.PGHOST) throw new Error("Set DATABASE_URL, or PGHOST/PGUSER/PGPASSWORD/PGDATABASE");
  return postgres({
    host: process.env.PGHOST,
    port: Number(process.env.PGPORT || 5432),
    user: process.env.PGUSER,
    password: process.env.PGPASSWORD,
    database: process.env.PGDATABASE,
    ...opts,
  });
}

/** Turns common connection failures into an instruction a human can act on. */
/** The underlying driver error (drizzle wraps it in `cause`). */
export function rootError(err: unknown): { code?: string; message?: string } {
  let e = err as { code?: string; message?: string; cause?: unknown };
  while (e && !e.code && e.cause) e = e.cause as typeof e;
  return e ?? {};
}

export function explainDbError(err: unknown): string | null {
  const e = rootError(err);
  switch (e?.code) {
    case "28P01":
    case "28000":
      return (
        "Postgres rejected the password. If you changed POSTGRES_PASSWORD after the first start, " +
        "the database still has the old one: put the old password back in .env, or (test data only) " +
        "delete $DATA_DIR/postgres and start again."
      );
    case "3D000":
      return "The database does not exist. Check POSTGRES_DB in .env (it is only applied on the very first start).";
    case "ENOTFOUND":
    case "EAI_AGAIN":
      return "Can't resolve the database host. In compose it must be \"db\".";
    case "ECONNREFUSED":
      return "Database is not accepting connections (yet).";
  }
  if (e?.message?.includes("Invalid URL")) {
    return "DATABASE_URL is not a valid URL. A password with @ / # : or spaces must be URL-encoded, or use PGHOST/PGUSER/PGPASSWORD instead.";
  }
  return null;
}
