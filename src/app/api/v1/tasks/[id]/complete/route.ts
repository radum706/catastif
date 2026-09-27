import { tasks } from "@/server/api";
import { assertWorkspace, body, handler } from "@/server/rest";

/** POST { "completed": true } (default true); false reopens. */
export const POST = handler<{ id: string }>("write", async ({ token, params, req }) => {
  const current = await tasks.getTaskRow(Number(params.id));
  assertWorkspace(token, current.workspace);
  const b = await body(req);
  const task = await tasks.setCompleted({ id: current.id, completed: b.completed !== false });
  return { task };
});
