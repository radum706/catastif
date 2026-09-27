import { projects } from "@/server/api";
import { assertWorkspace, handler } from "@/server/rest";

export const GET = handler<{ id: string }>("read", async ({ token, params }) => {
  const project = await projects.getProject(Number(params.id));
  assertWorkspace(token, project.workspace);
  return { project, money: await projects.projectMoney(project.id) };
});
