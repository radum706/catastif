import { tasks } from "@/server/api";
import { addDays, today } from "@/lib/dates";
import { handler, qp, readWorkspace } from "@/server/rest";

/** GET /api/v1/todo-before?date=YYYY-MM-DD&workspace= */
export const GET = handler("read", async ({ token, url }) => {
  const res = await tasks.todoBefore({
    date: qp(url, "date") ?? addDays(today(), 7),
    workspace: readWorkspace(token, qp(url, "workspace")),
  });
  return { date: res.date, tasks: res.tasks.map((r) => ({ ...r.task, projectName: r.projectName })), money: res.money.map((m) => m.tx) };
});
