import "server-only";
import { eq } from "drizzle-orm";
import { db } from "@/server/db/client";
import { sections, type Workspace } from "@/server/db/schema";
import { projects, tasks } from "@/server/api";
import { accountRef } from "@/server/api/workspace";
import { HttpError } from "@/server/rest";

/** Where a new task would land, so a workspace-limited token can be checked before writing. */
export async function taskTargetWorkspace(input: {
  workspace?: unknown;
  projectId?: unknown;
  sectionId?: unknown;
  parentId?: unknown;
}, fallback: Workspace | null): Promise<Workspace> {
  if (typeof input.parentId === "number") return (await tasks.getTaskRow(input.parentId)).workspace;
  if (typeof input.sectionId === "number") {
    const [sec] = await db.select().from(sections).where(eq(sections.id, input.sectionId));
    if (!sec) throw new HttpError(404, "Section not found");
    return (await projects.getProject(sec.projectId)).workspace;
  }
  if (typeof input.projectId === "number") return (await projects.getProject(input.projectId)).workspace;
  if (input.workspace === "personal" || input.workspace === "work") return input.workspace;
  if (fallback) return fallback;
  throw new HttpError(400, 'Give "workspace", "projectId", "sectionId" or "parentId"');
}

export async function accountWorkspace(accountId: unknown): Promise<Workspace> {
  if (typeof accountId !== "number") throw new HttpError(400, '"accountId" is required');
  return (await accountRef(accountId)).workspace;
}
