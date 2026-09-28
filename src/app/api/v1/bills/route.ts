import { payments } from "@/server/api";
import { handler, qp, readWorkspace } from "@/server/rest";

/** Open bills grouped by urgency, and money you're waiting for. */
export const GET = handler("read", async ({ token, url }) => {
  const workspace = readWorkspace(token, qp(url, "workspace"));
  const [b, c] = await Promise.all([payments.bills({ workspace }), payments.toCollect({ workspace })]);
  const flat = (rows: { tx: object }[]) => rows.map((r) => r.tx);
  return {
    bills: { overdue: flat(b.overdue), dueSoon: flat(b.dueSoon), later: flat(b.later) },
    toCollect: { invoiced: flat(c.invoiced), expected: flat(c.expected) },
  };
});
