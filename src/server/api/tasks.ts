import { and, asc, desc, eq, gte, ilike, inArray, isNull, lte, max, or, sql, type AnyColumn, type SQL } from "drizzle-orm";
import { alias } from "drizzle-orm/pg-core";
import { z } from "zod";
import { db } from "@/server/db/client";
import {
  projects,
  sections,
  tags,
  taskActivity,
  taskTags,
  tasks,
  type Task,
  type Workspace,
} from "@/server/db/schema";
import { addDays, today, type ISODate } from "@/lib/dates";
import { invalid, notFound } from "./errors";
import { emit } from "./events";
import * as s from "./schemas";
import { listOpen, listTransactions } from "./transactions";

export const priority = z.enum(["none", "low", "medium", "high"]);
const time = z
  .string()
  .regex(/^([01]\d|2[0-3]):[0-5]\d(:[0-5]\d)?$/, "Time must be HH:MM")
  .transform((v) => v.slice(0, 5));
const tagNames = z.array(z.string().trim().min(1).max(50)).max(20);

export const createTaskInput = z.object({
  workspace: s.workspace.optional(),
  projectId: s.optionalId,
  sectionId: s.optionalId,
  parentId: s.optionalId,
  title: s.name,
  notes: z.string().trim().max(20_000).nullish(),
  priority: priority.default("none"),
  startDate: s.isoDate.nullish(),
  dueDate: s.isoDate.nullish(),
  dueTime: time.nullish(),
  estimateMinutes: z.number().int().positive().max(100_000).nullish(),
  tags: tagNames.optional(),
});

export const updateTaskInput = createTaskInput.omit({ workspace: true, parentId: true }).partial().extend({ id: s.id });

// ---------- helpers ----------

async function logActivity(
  taskId: number,
  kind: "comment" | "created" | "completed" | "reopened" | "updated" | "moved",
  body?: string | null,
  data?: Record<string, unknown>,
) {
  await db.insert(taskActivity).values({ taskId, kind, body: body ?? null, data: data ?? null });
}

export async function getTaskRow(taskId: number): Promise<Task> {
  const [row] = await db.select().from(tasks).where(eq(tasks.id, taskId));
  return row ?? notFound("Task");
}

/** Works out workspace/project/section from whichever of them was given, and checks they agree. */
async function resolvePlacement(p: {
  workspace?: Workspace;
  projectId?: number | null;
  sectionId?: number | null;
  parentId?: number | null;
}): Promise<{ workspace: Workspace; projectId: number | null; sectionId: number | null }> {
  if (p.parentId) {
    const parent = await getTaskRow(p.parentId);
    if (parent.parentId) invalid("Subtasks can't have their own subtasks");
    if (p.workspace && p.workspace !== parent.workspace) invalid("Parent task belongs to the other workspace");
    return { workspace: parent.workspace, projectId: null, sectionId: null };
  }
  let projectId = p.projectId ?? null;
  if (p.sectionId) {
    const [sec] = await db.select().from(sections).where(eq(sections.id, p.sectionId));
    if (!sec) notFound("Section");
    if (projectId && projectId !== sec.projectId) invalid("Section is not in this project");
    projectId = sec.projectId;
  }
  if (projectId) {
    const [proj] = await db.select().from(projects).where(eq(projects.id, projectId));
    if (!proj) notFound("Project");
    if (p.workspace && p.workspace !== proj.workspace) invalid("Project belongs to the other workspace");
    return { workspace: proj.workspace, projectId, sectionId: p.sectionId ?? null };
  }
  if (!p.workspace) invalid("Pick a workspace or a project");
  return { workspace: p.workspace, projectId: null, sectionId: null };
}

const same = (col: AnyColumn, v: number | null) =>
  v === null ? sql`${col} is null` : sql`${col} = ${v}`;

async function nextPosition(where: { workspace: Workspace; projectId: number | null; sectionId: number | null; parentId: number | null }) {
  const [{ pos }] = await db
    .select({ pos: max(tasks.position) })
    .from(tasks)
    .where(
      and(
        eq(tasks.workspace, where.workspace),
        same(tasks.projectId, where.projectId),
        same(tasks.sectionId, where.sectionId),
        same(tasks.parentId, where.parentId),
      ),
    );
  return (pos ?? 0) + 1;
}

async function setTags(taskId: number, workspace: Workspace, names: string[]) {
  const byKey = new Map<string, string>();
  for (const n of names) if (!byKey.has(n.toLowerCase())) byKey.set(n.toLowerCase(), n); // first spelling wins
  const unique = [...byKey.values()];
  await db.delete(taskTags).where(eq(taskTags.taskId, taskId));
  if (!unique.length) return;
  await db
    .insert(tags)
    .values(unique.map((name) => ({ workspace, name })))
    .onConflictDoNothing();
  const rows = await db
    .select({ id: tags.id })
    .from(tags)
    .where(and(eq(tags.workspace, workspace), inArray(sql`lower(${tags.name})`, unique.map((n) => n.toLowerCase()))));
  await db
    .insert(taskTags)
    .values(rows.map((r) => ({ taskId, tagId: r.id })))
    .onConflictDoNothing();
}

// ---------- mutations ----------

export async function createTask(input: z.input<typeof createTaskInput>) {
  const { tags: tagList, workspace: ws, projectId: pid, sectionId: sid, parentId, ...data } = createTaskInput.parse(input);
  if (data.startDate && data.dueDate && data.startDate > data.dueDate) invalid("Start date is after the due date");
  const placement = await resolvePlacement({ workspace: ws, projectId: pid, sectionId: sid, parentId });
  const position = await nextPosition({ ...placement, parentId: parentId ?? null });
  const [task] = await db
    .insert(tasks)
    .values({ ...data, ...placement, parentId: parentId ?? null, position })
    .returning();
  if (tagList?.length) await setTags(task.id, task.workspace, tagList);
  await logActivity(task.id, "created");
  await emit("task.created", task.workspace, { task, tags: tagList ?? [] });
  return task;
}

const TRACKED = ["title", "notes", "priority", "startDate", "dueDate", "dueTime", "estimateMinutes"] as const;

export async function updateTask(input: z.input<typeof updateTaskInput>) {
  const { id, tags: tagList, projectId, sectionId, ...data } = updateTaskInput.parse(input);
  const current = await getTaskRow(id);
  const next = { ...current, ...data };
  if (next.startDate && next.dueDate && next.startDate > next.dueDate) invalid("Start date is after the due date");

  let placement: Partial<Pick<Task, "projectId" | "sectionId">> = {};
  const moving =
    (projectId !== undefined && projectId !== current.projectId) ||
    (sectionId !== undefined && sectionId !== current.sectionId);
  if (moving && !current.parentId) {
    const target = await resolvePlacement({
      workspace: current.workspace,
      projectId: projectId !== undefined ? projectId : sectionId ? null : current.projectId,
      // Changing project without naming a section drops the old section.
      sectionId: sectionId !== undefined ? sectionId : projectId !== undefined ? null : current.sectionId,
    });
    placement = { projectId: target.projectId, sectionId: target.sectionId };
  }

  const [row] = await db
    .update(tasks)
    .set({
      ...data,
      ...placement,
      ...(moving ? { position: await nextPosition({ workspace: current.workspace, projectId: placement.projectId ?? null, sectionId: placement.sectionId ?? null, parentId: null }) } : {}),
    })
    .where(eq(tasks.id, id))
    .returning();
  if (tagList) await setTags(id, current.workspace, tagList);

  const changed = TRACKED.filter((k) => data[k] !== undefined && data[k] !== current[k]);
  if (changed.length) await logActivity(id, "updated", null, { fields: changed });
  if (moving) await logActivity(id, "moved", null, { projectId: placement.projectId, sectionId: placement.sectionId });
  await emit("task.updated", row.workspace, { task: row, changed: [...changed, ...(moving ? ["section"] : [])] });
  return row;
}

export async function setCompleted(input: { id: number; completed: boolean }) {
  const { id, completed } = z.object({ id: s.id, completed: z.boolean() }).parse(input);
  const current = await getTaskRow(id);
  if (current.completed === completed) return current;
  const [row] = await db
    .update(tasks)
    .set({ completed, completedAt: completed ? new Date() : null })
    .where(eq(tasks.id, id))
    .returning();
  await logActivity(id, completed ? "completed" : "reopened");
  await emit(completed ? "task.completed" : "task.reopened", row.workspace, { task: row });
  return row;
}

/**
 * Drag and drop: put a task into a section (or none) between two neighbours.
 * `afterId` is the task just above the drop point, `beforeId` the one just below.
 */
export async function moveTask(input: { id: number; sectionId: number | null; afterId?: number | null; beforeId?: number | null }) {
  const data = z
    .object({ id: s.id, sectionId: s.optionalId, afterId: s.optionalId, beforeId: s.optionalId })
    .parse(input);
  const task = await getTaskRow(data.id);
  if (!task.projectId) invalid("Only project tasks can be moved between sections");
  if (data.sectionId) {
    const [sec] = await db.select().from(sections).where(eq(sections.id, data.sectionId));
    if (!sec || sec.projectId !== task.projectId) invalid("Section is not in this project");
  }
  const neighbour = async (nid?: number | null) => (nid ? (await getTaskRow(nid)).position : null);
  const [after, before] = await Promise.all([neighbour(data.afterId), neighbour(data.beforeId)]);
  const position =
    after !== null && before !== null
      ? (after + before) / 2
      : after !== null
        ? after + 1
        : before !== null
          ? before - 1
          : await nextPosition({ workspace: task.workspace, projectId: task.projectId, sectionId: data.sectionId ?? null, parentId: null });
  const [row] = await db
    .update(tasks)
    .set({ sectionId: data.sectionId ?? null, position })
    .where(eq(tasks.id, data.id))
    .returning();
  if ((data.sectionId ?? null) !== task.sectionId) {
    await logActivity(task.id, "moved", null, { sectionId: data.sectionId ?? null });
    await emit("task.updated", row.workspace, { task: row, changed: ["section"] });
  }
  return row;
}

export async function deleteTask(taskId: number) {
  const task = await getTaskRow(taskId);
  await db.delete(tasks).where(eq(tasks.id, taskId));
  await emit("task.deleted", task.workspace, { id: task.id, title: task.title });
}

export async function addComment(input: { taskId: number; body: string }) {
  const data = z.object({ taskId: s.id, body: z.string().trim().min(1).max(10_000) }).parse(input);
  await getTaskRow(data.taskId);
  const [row] = await db.insert(taskActivity).values({ taskId: data.taskId, kind: "comment", body: data.body }).returning();
  return row;
}

export async function deleteComment(commentId: number) {
  await db.delete(taskActivity).where(and(eq(taskActivity.id, commentId), eq(taskActivity.kind, "comment")));
}

// ---------- queries ----------

const parent = alias(tasks, "parent_task");

const tagsJson = sql<{ id: number; name: string; color: string }[]>`coalesce((
  select json_agg(json_build_object('id', tg.id, 'name', tg.name, 'color', tg.color) order by tg.name)
  from ${taskTags} tt join ${tags} tg on tg.id = tt.tag_id
  where tt.task_id = ${tasks.id}
), '[]'::json)`;

const subtaskCounts = {
  subtasks: sql<number>`(select count(*) from ${tasks} st where st.parent_id = ${tasks.id})`.mapWith(Number),
  subtasksDone: sql<number>`(select count(*) from ${tasks} st where st.parent_id = ${tasks.id} and st.completed)`.mapWith(Number),
};

export const listTasksInput = z.object({
  workspace: s.workspace.optional(),
  projectId: s.optionalId,
  /** true: only tasks without a project. */
  noProject: z.boolean().optional(),
  sectionId: s.optionalId,
  /** A task id, or "top" for top-level tasks only. */
  parentId: z.union([s.id, z.literal("top")]).optional(),
  completed: z.boolean().optional(),
  dueFrom: s.isoDate.optional(),
  dueTo: s.isoDate.optional(),
  hasDue: z.boolean().optional(),
  tagId: s.optionalId,
  q: z.string().trim().max(200).optional(),
  completedSince: z.date().optional(),
  limit: z.number().int().min(1).max(2000).default(500),
});

export async function listTasks(input: z.input<typeof listTasksInput> = {}) {
  const f = listTasksInput.parse(input);
  const where: (SQL | undefined)[] = [];
  if (f.workspace) where.push(eq(tasks.workspace, f.workspace));
  if (f.projectId) where.push(eq(tasks.projectId, f.projectId));
  if (f.noProject) where.push(isNull(tasks.projectId));
  if (f.sectionId) where.push(eq(tasks.sectionId, f.sectionId));
  if (f.parentId === "top") where.push(isNull(tasks.parentId));
  else if (f.parentId) where.push(eq(tasks.parentId, f.parentId));
  if (f.completed !== undefined) where.push(eq(tasks.completed, f.completed));
  if (f.dueFrom) where.push(gte(tasks.dueDate, f.dueFrom));
  if (f.dueTo) where.push(lte(tasks.dueDate, f.dueTo));
  if (f.hasDue === true) where.push(sql`${tasks.dueDate} is not null`);
  if (f.hasDue === false) where.push(isNull(tasks.dueDate));
  if (f.completedSince) where.push(gte(tasks.completedAt, f.completedSince));
  if (f.tagId) where.push(sql`exists (select 1 from ${taskTags} tt where tt.task_id = ${tasks.id} and tt.tag_id = ${f.tagId})`);
  if (f.q) {
    const like = `%${f.q.replace(/[%_\\]/g, "\\$&")}%`;
    where.push(or(ilike(tasks.title, like), ilike(tasks.notes, like)));
  }

  return db
    .select({
      task: tasks,
      projectName: projects.name,
      projectColor: projects.color,
      sectionName: sections.name,
      parentTitle: parent.title,
      tags: tagsJson,
      ...subtaskCounts,
    })
    .from(tasks)
    .leftJoin(projects, eq(projects.id, tasks.projectId))
    .leftJoin(sections, eq(sections.id, tasks.sectionId))
    .leftJoin(parent, eq(parent.id, tasks.parentId))
    .where(and(...where))
    .orderBy(
      asc(tasks.completed),
      sql`${tasks.dueDate} asc nulls last`,
      sql`${tasks.dueTime} asc nulls last`,
      asc(tasks.position),
      asc(tasks.id),
    )
    .limit(f.limit);
}

export type TaskRow = Awaited<ReturnType<typeof listTasks>>[number];

/** Asana-style My Tasks: everything open with a date, plus loose tasks without a project. */
export async function myTasks(opts: { workspace?: Workspace } = {}) {
  const t = today();
  const week = addDays(t, 7);
  const [dated, loose, done] = await Promise.all([
    listTasks({ workspace: opts.workspace, completed: false, hasDue: true }),
    listTasks({ workspace: opts.workspace, completed: false, hasDue: false, noProject: true, parentId: "top" }),
    listTasks({ workspace: opts.workspace, completed: true, completedSince: new Date(Date.now() - 7 * 86_400_000), limit: 30 }),
  ]);
  const due = (r: TaskRow) => r.task.dueDate!;
  return {
    overdue: dated.filter((r) => due(r) < t),
    today: dated.filter((r) => due(r) === t),
    thisWeek: dated.filter((r) => due(r) > t && due(r) <= week),
    later: dated.filter((r) => due(r) > week),
    noDate: loose,
    recentlyCompleted: done.sort((a, b) => (b.task.completedAt?.getTime() ?? 0) - (a.task.completedAt?.getTime() ?? 0)),
  };
}

/** "To do before date X": open tasks due by X plus money (bills, expected income) due by X. */
export async function todoBefore(input: { date: ISODate; workspace?: Workspace }) {
  const { date, workspace } = z.object({ date: s.isoDate, workspace: s.workspace.optional() }).parse(input);
  const [taskRows, money] = await Promise.all([
    listTasks({ workspace, completed: false, dueTo: date }),
    listOpen({ workspace, excludeTransfers: true }),
  ]);
  return {
    date,
    tasks: taskRows,
    money: money.filter((m) => (m.tx.dueDate ?? m.tx.date) <= date),
  };
}

export async function getTaskDetail(taskId: number) {
  const [row] = await listTasksById([taskId]);
  if (!row) notFound("Task");
  const [subtasks, activity, money] = await Promise.all([
    listTasks({ parentId: taskId }),
    db.select().from(taskActivity).where(eq(taskActivity.taskId, taskId)).orderBy(desc(taskActivity.createdAt), desc(taskActivity.id)),
    listTransactions({ taskId }),
  ]);
  return { ...row, subtasks, activity, money };
}

async function listTasksById(ids: number[]) {
  if (!ids.length) return [];
  return db
    .select({
      task: tasks,
      projectName: projects.name,
      projectColor: projects.color,
      sectionName: sections.name,
      parentTitle: parent.title,
      tags: tagsJson,
      ...subtaskCounts,
    })
    .from(tasks)
    .leftJoin(projects, eq(projects.id, tasks.projectId))
    .leftJoin(sections, eq(sections.id, tasks.sectionId))
    .leftJoin(parent, eq(parent.id, tasks.parentId))
    .where(inArray(tasks.id, ids));
}

export async function listTags(workspace: Workspace) {
  return db.select().from(tags).where(eq(tags.workspace, workspace)).orderBy(asc(tags.name));
}
