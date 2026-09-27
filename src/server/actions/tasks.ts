"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { calendar, projects, tasks } from "@/server/api";
import { requireSession } from "@/server/auth/session";
import { getWorkspace } from "@/server/workspace";
import { parseTaskLine } from "@/lib/task-parse";
import { today } from "@/lib/dates";
import { fmt, t } from "@/i18n";
import { bool, errorMessage, int, optInt, optStr, str, type ActionState } from "./form";

async function run(fn: () => Promise<unknown>, redirectTo?: string): Promise<ActionState> {
  await requireSession();
  try {
    await fn();
  } catch (err) {
    return { error: errorMessage(err), ts: Date.now() };
  }
  revalidatePath("/", "layout");
  if (redirectTo) redirect(redirectTo);
  return { ts: Date.now() };
}

async function act(fn: () => Promise<unknown>) {
  await requireSession();
  await fn();
  revalidatePath("/", "layout");
}

// ---------- tasks ----------

/** One-line add: "Call accountant tomorrow 14:00 !high #admin". */
export async function quickAddTaskAction(_: ActionState, fd: FormData): Promise<ActionState> {
  await requireSession();
  try {
    const parsed = parseTaskLine(str(fd, "text"), today());
    if (!parsed.title) return { error: t.tasks.quickAddPlaceholder, ts: Date.now() };
    const projectId = optInt(fd, "projectId");
    const sectionId = optInt(fd, "sectionId");
    const parentId = optInt(fd, "parentId");
    const task = await tasks.createTask({
      workspace: projectId || sectionId || parentId ? undefined : ((optStr(fd, "workspace") as "personal" | "work" | null) ?? (await getWorkspace())),
      projectId,
      sectionId,
      parentId,
      title: parsed.title,
      dueDate: parsed.dueDate,
      dueTime: parsed.dueTime,
      priority: parsed.priority,
      tags: parsed.tags,
    });
    revalidatePath("/", "layout");
    return { message: fmt(t.tasks.added, { title: task.title }), ts: Date.now() };
  } catch (err) {
    return { error: errorMessage(err), ts: Date.now() };
  }
}

export async function toggleTaskAction(fd: FormData) {
  await act(() => tasks.setCompleted({ id: int(fd, "id"), completed: bool(fd, "completed") }));
}

/** One select: "" = no project, "p:12" = project 12, "s:34" = section 34. */
function placement(fd: FormData): { projectId?: number | null; sectionId?: number | null } {
  if (!fd.has("placement")) return {};
  const v = str(fd, "placement");
  if (v.startsWith("s:")) return { sectionId: Number(v.slice(2)) };
  if (v.startsWith("p:")) return { projectId: Number(v.slice(2)), sectionId: null };
  return { projectId: null, sectionId: null };
}

export async function updateTaskAction(_: ActionState, fd: FormData) {
  const tagText = str(fd, "tags");
  return run(() =>
    tasks.updateTask({
      id: int(fd, "id"),
      title: str(fd, "title"),
      notes: optStr(fd, "notes"),
      priority: str(fd, "priority") as "none" | "low" | "medium" | "high",
      startDate: optStr(fd, "startDate"),
      dueDate: optStr(fd, "dueDate"),
      dueTime: optStr(fd, "dueTime"),
      estimateMinutes: optInt(fd, "estimateMinutes"),
      ...placement(fd),
      tags: tagText ? tagText.split(",").map((x) => x.trim()).filter(Boolean) : [],
    }),
  );
}

export async function deleteTaskAction(fd: FormData) {
  await act(() => tasks.deleteTask(int(fd, "id")));
  redirect(str(fd, "returnTo").startsWith("/") ? str(fd, "returnTo") : "/tasks");
}

export async function moveTaskAction(input: { id: number; sectionId: number | null; afterId?: number | null; beforeId?: number | null }) {
  await act(() => tasks.moveTask(input));
}

export async function addCommentAction(_: ActionState, fd: FormData) {
  return run(() => tasks.addComment({ taskId: int(fd, "taskId"), body: str(fd, "body") }));
}

export async function deleteCommentAction(fd: FormData) {
  await act(() => tasks.deleteComment(int(fd, "id")));
}

// ---------- projects ----------

export async function createProjectAction(_: ActionState, fd: FormData): Promise<ActionState> {
  await requireSession();
  let id: number;
  try {
    const p = await projects.createProject({
      workspace: await getWorkspace(),
      name: str(fd, "name"),
      description: optStr(fd, "description"),
      color: (optStr(fd, "color") ?? "teal") as "teal",
      dueDate: optStr(fd, "dueDate"),
      template: (optStr(fd, "template") ?? "board") as "board",
    });
    id = p.id;
  } catch (err) {
    return { error: errorMessage(err), ts: Date.now() };
  }
  revalidatePath("/", "layout");
  redirect(`/tasks/projects/${id}`);
}

export async function updateProjectAction(_: ActionState, fd: FormData) {
  return run(() =>
    projects.updateProject({
      id: int(fd, "id"),
      name: str(fd, "name"),
      description: optStr(fd, "description"),
      color: str(fd, "color") as "teal",
      status: str(fd, "status") as "active",
      startDate: optStr(fd, "startDate"),
      dueDate: optStr(fd, "dueDate"),
    }),
  );
}

export async function deleteProjectAction(fd: FormData) {
  await act(() => projects.deleteProject(int(fd, "id")));
  redirect("/tasks/projects");
}

export async function createSectionAction(_: ActionState, fd: FormData) {
  return run(() => projects.createSection({ projectId: int(fd, "projectId"), name: str(fd, "name") }));
}

export async function renameSectionAction(_: ActionState, fd: FormData) {
  return run(() => projects.renameSection({ id: int(fd, "id"), name: str(fd, "name") }));
}

export async function deleteSectionAction(fd: FormData) {
  await act(() => projects.deleteSection(int(fd, "id")));
}

export async function reorderSectionsAction(input: { projectId: number; ids: number[] }) {
  await act(() => projects.reorderSections(input));
}

// ---------- calendar ----------

export async function rescheduleAction(input: { key: string; date: string }): Promise<{ error?: string }> {
  await requireSession();
  try {
    await calendar.reschedule(input);
  } catch (err) {
    return { error: errorMessage(err) };
  }
  revalidatePath("/", "layout");
  return {};
}
