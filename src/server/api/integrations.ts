import { createHash, createHmac, randomBytes } from "node:crypto";
import { and, asc, desc, eq, gt, inArray, isNull, lte, or, sql } from "drizzle-orm";
import { z } from "zod";
import { db } from "@/server/db/client";
import {
  apiTokens,
  TOKEN_SCOPES,
  WEBHOOK_EVENTS,
  webhookDeliveries,
  webhooks,
  type ApiToken,
  type TokenScope,
  type Webhook,
} from "@/server/db/schema";
import { notFound } from "./errors";
import { emit } from "./events";
import * as s from "./schemas";

const sha256 = (v: string) => createHash("sha256").update(v).digest("hex");

// ---------- API tokens ----------

export const createTokenInput = z.object({
  name: s.name,
  scopes: z.array(z.enum(TOKEN_SCOPES)).min(1),
  workspace: s.workspace.nullish(),
});

/** Returns the raw token once; only its hash is stored. */
export async function createToken(input: z.input<typeof createTokenInput>) {
  const data = createTokenInput.parse(input);
  const raw = `cat_${randomBytes(24).toString("base64url")}`;
  const [row] = await db
    .insert(apiTokens)
    .values({ ...data, workspace: data.workspace ?? null, prefix: raw.slice(0, 10), tokenHash: sha256(raw) })
    .returning();
  return { token: raw, row };
}

/** Tokens made in Settings (OAuth tokens are listed per connected app instead). */
export async function listTokens() {
  return db
    .select()
    .from(apiTokens)
    .where(isNull(apiTokens.clientId))
    .orderBy(asc(apiTokens.revokedAt), desc(apiTokens.createdAt));
}

export async function revokeToken(tokenId: number) {
  await db.update(apiTokens).set({ revokedAt: new Date() }).where(eq(apiTokens.id, tokenId));
}

export async function deleteToken(tokenId: number) {
  await db.delete(apiTokens).where(eq(apiTokens.id, tokenId));
}

/** Looks up an active token; null if unknown or revoked. */
export async function verifyToken(raw: string): Promise<ApiToken | null> {
  if (!raw.startsWith("cat_") || raw.length > 100) return null;
  const [row] = await db
    .select()
    .from(apiTokens)
    .where(
      and(
        eq(apiTokens.tokenHash, sha256(raw)),
        isNull(apiTokens.revokedAt),
        or(isNull(apiTokens.expiresAt), gt(apiTokens.expiresAt, new Date())),
      ),
    );
  if (!row) return null;
  // Cheap "last used", at most once a minute.
  if (!row.lastUsedAt || Date.now() - row.lastUsedAt.getTime() > 60_000) {
    await db.update(apiTokens).set({ lastUsedAt: new Date() }).where(eq(apiTokens.id, row.id));
  }
  return row;
}

export function hasScope(token: ApiToken, scope: TokenScope) {
  // "write" implies "read" and "inbox".
  return token.scopes.includes(scope) || (token.scopes.includes("write") && (scope === "read" || scope === "inbox"));
}

// ---------- webhooks ----------

const eventName = z.union([z.enum(WEBHOOK_EVENTS), z.literal("*")]);

export const createWebhookInput = z.object({
  name: s.name,
  url: z.url({ protocol: /^https?$/ }).max(2000),
  events: z.array(eventName).min(1),
  workspace: s.workspace.nullish(),
});

export const updateWebhookInput = createWebhookInput.partial().extend({ id: s.id, active: z.boolean().optional() });

export async function listWebhooks() {
  return db.select().from(webhooks).orderBy(asc(webhooks.name));
}

export async function getWebhook(webhookId: number) {
  const [row] = await db.select().from(webhooks).where(eq(webhooks.id, webhookId));
  return row ?? notFound("Webhook");
}

export async function createWebhook(input: z.input<typeof createWebhookInput>) {
  const data = createWebhookInput.parse(input);
  const [row] = await db
    .insert(webhooks)
    .values({ ...data, workspace: data.workspace ?? null, secret: `whsec_${randomBytes(24).toString("base64url")}` })
    .returning();
  return row;
}

export async function updateWebhook(input: z.input<typeof updateWebhookInput>) {
  const { id, ...data } = updateWebhookInput.parse(input);
  const [row] = await db.update(webhooks).set(data).where(eq(webhooks.id, id)).returning();
  return row ?? notFound("Webhook");
}

export async function rotateWebhookSecret(webhookId: number) {
  const [row] = await db
    .update(webhooks)
    .set({ secret: `whsec_${randomBytes(24).toString("base64url")}` })
    .where(eq(webhooks.id, webhookId))
    .returning();
  return row ?? notFound("Webhook");
}

export async function deleteWebhook(webhookId: number) {
  await db.delete(webhooks).where(eq(webhooks.id, webhookId));
}

/** Queues a "ping" for one webhook so you can check n8n receives it. */
export async function pingWebhook(webhookId: number) {
  const hook = await getWebhook(webhookId);
  await db.insert(webhookDeliveries).values({
    webhookId: hook.id,
    event: "ping",
    payload: { event: "ping", workspace: hook.workspace, occurredAt: new Date().toISOString(), data: { message: "Hello from Catastif" } },
  });
}

export async function listDeliveries(opts: { webhookId?: number; limit?: number } = {}) {
  return db
    .select()
    .from(webhookDeliveries)
    .where(opts.webhookId ? eq(webhookDeliveries.webhookId, opts.webhookId) : undefined)
    .orderBy(desc(webhookDeliveries.createdAt), desc(webhookDeliveries.id))
    .limit(opts.limit ?? 50);
}

export async function retryDelivery(deliveryId: number) {
  await db
    .update(webhookDeliveries)
    .set({ status: "pending", nextAttemptAt: new Date(), error: null })
    .where(eq(webhookDeliveries.id, deliveryId));
}

/**
 * Signature n8n (or anything else) can verify:
 *   X-Catastif-Signature: sha256=hex(HMAC_SHA256(secret, `${timestamp}.${body}`))
 */
export function sign(secret: string, timestamp: string, body: string) {
  return `sha256=${createHmac("sha256", secret).update(`${timestamp}.${body}`).digest("hex")}`;
}

/** Backoff after each failed attempt; after the last one the delivery is marked failed. */
const BACKOFF_MINUTES = [1, 5, 30, 120, 720];

type Fetch = typeof fetch;

/** Sends due deliveries. Called by the worker every minute. */
export async function deliverDue(opts: { limit?: number; fetchImpl?: Fetch; now?: Date } = {}) {
  const now = opts.now ?? new Date();
  const doFetch = opts.fetchImpl ?? fetch;
  const due = await db
    .select({ d: webhookDeliveries, hook: webhooks })
    .from(webhookDeliveries)
    .innerJoin(webhooks, eq(webhooks.id, webhookDeliveries.webhookId))
    .where(and(eq(webhookDeliveries.status, "pending"), lte(webhookDeliveries.nextAttemptAt, now)))
    .orderBy(asc(webhookDeliveries.nextAttemptAt), asc(webhookDeliveries.id))
    .limit(opts.limit ?? 25);

  let delivered = 0;
  let failed = 0;
  for (const { d, hook } of due) {
    const ok = await deliverOne(d.id, d.event, d.payload, d.attempts, hook, doFetch, now);
    if (ok) delivered++;
    else failed++;
  }
  return { attempted: due.length, delivered, failed };
}

async function deliverOne(
  id: number,
  event: string,
  payload: Record<string, unknown>,
  attempts: number,
  hook: Webhook,
  doFetch: Fetch,
  now: Date,
) {
  const body = JSON.stringify({ id, ...payload });
  const timestamp = String(Math.floor(now.getTime() / 1000));
  let status: number | null = null;
  let error: string | null = null;
  try {
    const res = await doFetch(hook.url, {
      method: "POST",
      headers: {
        "content-type": "application/json",
        "user-agent": "Catastif-Webhooks/1",
        "x-catastif-event": event,
        "x-catastif-delivery": String(id),
        "x-catastif-timestamp": timestamp,
        "x-catastif-signature": sign(hook.secret, timestamp, body),
      },
      body,
      signal: AbortSignal.timeout(10_000),
      redirect: "manual",
    });
    status = res.status;
    if (!res.ok) error = `HTTP ${res.status}`;
  } catch (err) {
    error = err instanceof Error ? err.message : String(err);
  }

  const tries = attempts + 1;
  if (!error) {
    await db
      .update(webhookDeliveries)
      .set({ status: "delivered", attempts: tries, responseStatus: status, error: null, deliveredAt: now })
      .where(eq(webhookDeliveries.id, id));
  } else {
    const wait = BACKOFF_MINUTES[tries - 1];
    await db
      .update(webhookDeliveries)
      .set({
        status: wait === undefined ? "failed" : "pending",
        attempts: tries,
        responseStatus: status,
        error: error.slice(0, 500),
        nextAttemptAt: new Date(now.getTime() + (wait ?? 0) * 60_000),
      })
      .where(eq(webhookDeliveries.id, id));
  }
  await db
    .update(webhooks)
    .set({ lastStatus: status, lastError: error, lastDeliveredAt: now })
    .where(eq(webhooks.id, hook.id));
  return !error;
}

/** Deletes delivered/failed rows older than `days`. */
export async function pruneDeliveries(days = 30) {
  await db
    .delete(webhookDeliveries)
    .where(
      and(
        inArray(webhookDeliveries.status, ["delivered", "failed"]),
        lte(webhookDeliveries.createdAt, sql`now() - make_interval(days => ${days})`),
      ),
    );
}

export { emit };
