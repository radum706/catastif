import { forecast } from "@/server/api";
import { today } from "@/lib/dates";
import { handler, qp, readWorkspace } from "@/server/rest";

/** GET /api/v1/balance?date=YYYY-MM-DD&workspace= — balance per account and per currency at a date. */
export const GET = handler("read", async ({ token, url }) => {
  const workspace = readWorkspace(token, qp(url, "workspace"));
  const date = qp(url, "date") ?? today();
  const [b, safe] = await Promise.all([forecast.balanceAt({ date, workspace }), forecast.safeToSpend(workspace)]);
  return {
    date,
    accounts: b.perAccount.map((p) => ({ id: p.account.id, name: p.account.name, workspace: p.account.workspace, currency: p.account.currency, current: p.current, atDate: p.atDate })),
    totals: b.totals,
    safeToSpend: safe,
  };
});
