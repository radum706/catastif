import { projects } from "@/server/api";
import { assertWorkspace, body, handler, qbool, qp, readWorkspace } from "@/server/rest";
import { HttpError } from "@/server/rest";

export const GET = handler("read", async ({ token, url }) => {
  const rows = await projects.listProjects({
    workspace: readWorkspace(token, qp(url, "workspace")),
    includeArchived: qbool(url, "archived"),
  });
  return { projects: rows.map(({ project, ...counts }) => ({ ...project, ...counts })) };
});

/** POST { name, workspace, template?: "board"|"list"|"empty", color?, dueDate?, description? } */
export const POST = handler("write", async ({ token, req }) => {
  const b = await body(req);
  const ws = b.workspace ?? token.workspace;
  if (ws !== "personal" && ws !== "work") throw new HttpError(400, '"workspace" is required');
  assertWorkspace(token, ws);
  const project = await projects.createProject({ ...(b as object), workspace: ws } as Parameters<typeof projects.createProject>[0]);
  return Response.json({ project }, { status: 201 });
});
