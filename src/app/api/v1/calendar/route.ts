import { calendar } from "@/server/api";
import { addDays, today } from "@/lib/dates";
import { handler, qbool, qp, readWorkspace } from "@/server/rest";

/** GET /api/v1/calendar?from=&to=&workspace=&paid=true */
export const GET = handler("read", async ({ token, url }) => {
  const from = qp(url, "from") ?? today();
  const items = await calendar.calendarItems({
    from,
    to: qp(url, "to") ?? addDays(from, 30),
    workspace: readWorkspace(token, qp(url, "workspace")),
    showSettled: qbool(url, "paid") ?? false,
  });
  return { items };
});
