// Background jobs. Runs as its own container from the same image: `node dist/worker.mjs`.
// Phase 1: keep recurring rules materialised and clean up expired sessions.
// Later phases add ntfy reminders here.
import { Cron } from "croner";
import { lt } from "drizzle-orm";
import { generateAll } from "@/server/api/recurring";
import { db, closeDb } from "@/server/db/client";
import { sessions } from "@/server/db/schema";
import { appTimeZone } from "@/lib/dates";

const tz = appTimeZone();

function log(msg: string, extra?: unknown) {
  console.log(`[worker ${new Date().toISOString()}] ${msg}`, extra ?? "");
}

async function job(name: string, fn: () => Promise<unknown>) {
  try {
    const res = await fn();
    log(`${name} ok`, res);
  } catch (err) {
    console.error(`[worker] ${name} failed`, err);
  }
}

const recurringJob = () => job("recurring", () => generateAll());
const sessionsJob = () => job("sessions", () => db.delete(sessions).where(lt(sessions.expiresAt, new Date())));

const jobs = [
  new Cron("15 1 * * *", { timezone: tz, protect: true }, recurringJob),
  new Cron("30 1 * * *", { timezone: tz, protect: true }, sessionsJob),
];

log(`started (tz ${tz})`, jobs.map((j) => j.nextRun()?.toISOString()));
// Catch up right away after a restart or a server that was off at night.
void recurringJob();

async function shutdown() {
  jobs.forEach((j) => j.stop());
  await closeDb();
  process.exit(0);
}
process.on("SIGTERM", shutdown);
process.on("SIGINT", shutdown);
