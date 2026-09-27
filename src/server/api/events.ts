import { and, eq, isNull, or, sql } from "drizzle-orm";
import { db } from "@/server/db/client";
import { webhookDeliveries, webhooks, type WebhookEvent, type Workspace } from "@/server/db/schema";

/**
 * Records an event for every active webhook that wants it (outbox pattern).
 * The worker delivers them; a failing receiver never blocks the change itself.
 */
export async function emit(event: WebhookEvent, workspace: Workspace | null, data: Record<string, unknown>) {
  try {
    const hooks = await db
      .select({ id: webhooks.id })
      .from(webhooks)
      .where(
        and(
          eq(webhooks.active, true),
          or(sql`${event} = any(${webhooks.events})`, sql`'*' = any(${webhooks.events})`),
          workspace ? or(isNull(webhooks.workspace), eq(webhooks.workspace, workspace)) : undefined,
        ),
      );
    if (!hooks.length) return;
    const payload = { event, workspace, occurredAt: new Date().toISOString(), data };
    await db.insert(webhookDeliveries).values(hooks.map((h) => ({ webhookId: h.id, event, payload })));
  } catch (err) {
    console.error(`[events] could not record ${event}`, err);
  }
}
