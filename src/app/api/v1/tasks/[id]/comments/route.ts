import { tasks } from "@/server/api";
import { assertWorkspace, body, handler } from "@/server/rest";

/** POST { "body": "text" } */
export const POST = handler<{ id: string }>("write", async ({ token, params, req }) => {
  const current = await tasks.getTaskRow(Number(params.id));
  assertWorkspace(token, current.workspace);
  const b = await body(req);
  const comment = await tasks.addComment({ taskId: current.id, body: String(b.body ?? "") });
  return Response.json({ comment }, { status: 201 });
});
