import { tasks } from "@/server/api";
import { assertWorkspace, body, handler } from "@/server/rest";

type P = { id: string };

export const GET = handler<P>("read", async ({ token, params }) => {
  const d = await tasks.getTaskDetail(Number(params.id));
  assertWorkspace(token, d.task.workspace);
  const { task, subtasks, activity, money, ...rest } = d;
  return {
    task: { ...task, ...rest },
    subtasks: subtasks.map((s) => s.task),
    activity,
    transactions: money.map((m) => m.tx),
  };
});

/** PATCH any of: title, notes, priority, startDate, dueDate, dueTime, estimateMinutes, projectId, sectionId, tags */
export const PATCH = handler<P>("write", async ({ token, params, req }) => {
  const current = await tasks.getTaskRow(Number(params.id));
  assertWorkspace(token, current.workspace);
  const task = await tasks.updateTask({ ...(await body(req)), id: current.id } as Parameters<typeof tasks.updateTask>[0]);
  return { task };
});

export const DELETE = handler<P>("write", async ({ token, params }) => {
  const current = await tasks.getTaskRow(Number(params.id));
  assertWorkspace(token, current.workspace);
  await tasks.deleteTask(current.id);
  return { ok: true };
});
