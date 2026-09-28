import { tasks } from "@/server/api";
import { parseTaskLine } from "@/lib/task-parse";
import { today } from "@/lib/dates";
import { assertWorkspace, body, handler, qbool, qint, qp, readWorkspace } from "@/server/rest";
import { taskTargetWorkspace } from "@/server/rest-targets";

/** GET /api/v1/tasks?workspace=&projectId=&completed=&dueTo=&dueFrom=&q=&limit= */
export const GET = handler("read", async ({ token, url }) => {
  const rows = await tasks.listTasks({
    workspace: readWorkspace(token, qp(url, "workspace")),
    projectId: qint(url, "projectId"),
    completed: qbool(url, "completed"),
    dueFrom: qp(url, "dueFrom"),
    dueTo: qp(url, "dueTo"),
    q: qp(url, "q"),
    parentId: qbool(url, "subtasks") ? undefined : "top",
    limit: qint(url, "limit") ?? 200,
  });
  return { tasks: rows.map(({ task, ...rest }) => ({ ...task, ...rest })) };
});

/**
 * POST /api/v1/tasks
 *   { "text": "Call accountant tomorrow 14:00 !high #admin", "workspace": "work" }
 * or the full shape: { title, workspace | projectId | sectionId | parentId, dueDate, dueTime, priority, notes, tags }
 */
export const POST = handler("write", async ({ token, req }) => {
  const b = await body(req);
  const ws = await taskTargetWorkspace(b, token.workspace);
  assertWorkspace(token, ws);
  let input: Record<string, unknown> = b;
  if (typeof b.text === "string") {
    const { text, ...rest } = b;
    const p = parseTaskLine(text as string, today());
    input = { ...rest, title: p.title, dueDate: p.dueDate, dueTime: p.dueTime, priority: p.priority, tags: p.tags };
  }
  const hasPlacement = input.projectId || input.sectionId || input.parentId;
  const task = await tasks.createTask({ ...input, workspace: hasPlacement ? undefined : ws } as Parameters<typeof tasks.createTask>[0]);
  return Response.json({ task }, { status: 201 });
});
