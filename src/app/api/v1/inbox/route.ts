import { inbox } from "@/server/api";
import { body, handler, qp, readWorkspace } from "@/server/rest";
import { HttpError } from "@/server/rest";

/**
 * Phone / n8n / email capture:
 *   POST { "text": "Pay Enel 230 lei by Friday", "source": "phone", "workspace": "personal" }
 * Needs the "inbox" scope (or "write"). The text is drafted by AI and waits in the Inbox for approval.
 */
export const POST = handler("inbox", async ({ token, req }) => {
  const b = await body(req);
  if (typeof b.text !== "string" || !b.text.trim()) throw new HttpError(400, '"text" is required');
  const item = await inbox.capture({
    text: b.text,
    source: (typeof b.source === "string" ? b.source : "api") as "api",
    workspace: readWorkspace(token, typeof b.workspace === "string" ? b.workspace : undefined) ?? null,
    kind: b.kind === "task" || b.kind === "transaction" ? b.kind : undefined,
  });
  return Response.json({ item }, { status: 201 });
});

/** GET ?status=pending|approved|rejected */
export const GET = handler("read", async ({ token, url }) => {
  const status = qp(url, "status");
  const ws = readWorkspace(token, undefined);
  const items = await inbox.listInbox({ status: status ? [status as "pending"] : ["pending"] });
  return { items: ws ? items.filter((i) => (i.draft as { workspace?: string } | null)?.workspace === ws || i.workspace === ws) : items };
});
