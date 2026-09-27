// Background jobs. Runs as its own container from the same image: `node dist/worker/index.mjs`.
import { Cron } from "croner";
import { lt } from "drizzle-orm";
import { overdueDigest } from "@/server/api/digest";
import { deliverDue, pruneDeliveries } from "@/server/api/integrations";
import { generateAll } from "@/server/api/recurring";
import { db, closeDb } from "@/server/db/client";
import { sessions } from "@/server/db/schema";
import { appTimeZone } from "@/lib/dates";

const tz = appTimeZone();

function log(msg: string, extra?: unknown) {
  console.log(`[worker ${new Date().toISOString()}] ${msg}`, extra ?? "");
}

async function job(name: string, fn: () => Promise<unknown>, quiet = false): Promise<void> {
  try {
    const res = await fn();
    if (!quiet) log(`${name} ok`, res);
  } catch (err) {
    console.error(`[worker] ${name} failed`, err);
  }
}

const recurringJob = () => job("recurring", () => generateAll());
const webhookJob = () =>
  job(
    "webhooks",
    async () => {
      const r = await deliverDue();
      if (r.attempted) log("webhooks", r);
      return r;
    },
    true,
  );

const jobs = [
  new Cron("15 1 * * *", { timezone: tz, protect: true }, recurringJob),
  new Cron("30 1 * * *", { timezone: tz, protect: true }, () =>
    job("cleanup", async () => {
      await db.delete(sessions).where(lt(sessions.expiresAt, new Date()));
      await pruneDeliveries(30);
    }),
  ),
  new Cron(process.env.DIGEST_CRON || "0 8 * * *", { timezone: tz, protect: true }, () => job("overdue digest", overdueDigest)),
  // Outgoing webhooks (n8n etc.): picked up within ~15 seconds.
  new Cron("*/15 * * * * *", { timezone: tz, protect: true }, webhookJob),
];

log(`started (tz ${tz})`, jobs.map((j) => j.nextRun()?.toISOString()));
// Catch up right away after a restart or a night the server was off.
void recurringJob();

async function shutdown() {
  jobs.forEach((j) => j.stop());
  await closeDb();
  process.exit(0);
}
process.on("SIGTERM", shutdown);
process.on("SIGINT", shutdown);
