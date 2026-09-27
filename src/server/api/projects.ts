import { and, asc, eq, isNull, max, sql } from "drizzle-orm";
import { z } from "zod";
import { db } from "@/server/db/client";
import { projects, sections, tasks, transactions, type Workspace } from "@/server/db/schema";
import { today } from "@/lib/dates";
import type { CurrencyCode } from "@/lib/money";
import { invalid, notFound } from "./errors";
import * as s from "./schemas";

export const PROJECT_COLORS = ["teal", "blue", "violet", "pink", "orange", "amber", "green", "slate"] as const;
const color = z.enum(PROJECT_COLORS);
const projectStatus = z.enum(["active", "on_hold", "done", "archived"]);

export const PROJECT_TEMPLATES = {
  board: ["To do", "In progress", "Done"],
  list: ["Tasks"],
  empty: [],
} as const;

export const createProjectInput = z.object({
  workspace: s.workspace,
  name: s.name,
  description: s.notes,
  color: color.default("teal"),
  startDate: s.isoDate.nullish(),
  dueDate: s.isoDate.nullish(),
  template: z.enum(["board", "list", "empty"]).default("board"),
});

export const updateProjectInput = z.object({
  id: s.id,
  name: s.name.optional(),
  description: s.notes,
  color: color.optional(),
  status: projectStatus.optional(),
  startDate: s.isoDate.nullish(),
  dueDate: s.isoDate.nullish(),
});

export async function listProjects(opts: { workspace?: Workspace; includeArchived?: boolean } = {}) {
  const t = today();
  const rows = await db
    .select({
      project: projects,
      open: sql<number>`count(${tasks.id}) filter (where not ${tasks.completed})`.mapWith(Number),
      done: sql<number>`count(${tasks.id}) filter (where ${tasks.completed})`.mapWith(Number),
      overdue: sql<number>`count(${tasks.id}) filter (where not ${tasks.completed} and ${tasks.dueDate} < ${t})`.mapWith(Number),
      nextDue: sql<string | null>`min(${tasks.dueDate}) filter (where not ${tasks.completed})`,
    })
    .from(projects)
    .leftJoin(tasks, and(eq(tasks.projectId, projects.id), isNull(tasks.parentId)))
    .where(opts.workspace ? eq(projects.workspace, opts.workspace) : undefined)
    .groupBy(projects.id)
    .orderBy(asc(projects.position), asc(projects.name));
  return opts.includeArchived ? rows : rows.filter((r) => r.project.status !== "archived");
}

export type ProjectListRow = Awaited<ReturnType<typeof listProjects>>[number];

export async function getProject(projectId: number) {
  const [project] = await db.select().from(projects).where(eq(projects.id, projectId));
  if (!project) notFound("Project");
  const secs = await db
    .select()
    .from(sections)
    .where(eq(sections.projectId, projectId))
    .orderBy(asc(sections.position), asc(sections.id));
  return { ...project, sections: secs };
}

export async function createProject(input: z.input<typeof createProjectInput>) {
  const { template, ...data } = createProjectInput.parse(input);
  return db.transaction(async (tx) => {
    const [{ pos }] = await tx
      .select({ pos: max(projects.position) })
      .from(projects)
      .where(eq(projects.workspace, data.workspace));
    const [project] = await tx
      .insert(projects)
      .values({ ...data, position: (pos ?? 0) + 1 })
      .returning();
    const names = PROJECT_TEMPLATES[template];
    if (names.length) {
      await tx.insert(sections).values(names.map((name, i) => ({ projectId: project.id, name, position: i + 1 })));
    }
    return project;
  });
}

export async function updateProject(input: z.input<typeof updateProjectInput>) {
  const { id, ...data } = updateProjectInput.parse(input);
  const [row] = await db.update(projects).set(data).where(eq(projects.id, id)).returning();
  return row ?? notFound("Project");
}

/** Deletes the project and its tasks. Linked transactions stay, unlinked. */
export async function deleteProject(projectId: number) {
  await db.delete(projects).where(eq(projects.id, projectId));
}

// ---------- sections ----------

export async function createSection(input: { projectId: number; name: string }) {
  const data = z.object({ projectId: s.id, name: s.name }).parse(input);
  const [{ pos }] = await db
    .select({ pos: max(sections.position) })
    .from(sections)
    .where(eq(sections.projectId, data.projectId));
  const [row] = await db
    .insert(sections)
    .values({ ...data, position: (pos ?? 0) + 1 })
    .returning();
  return row;
}

export async function renameSection(input: { id: number; name: string }) {
  const data = z.object({ id: s.id, name: s.name }).parse(input);
  const [row] = await db.update(sections).set({ name: data.name }).where(eq(sections.id, data.id)).returning();
  return row ?? notFound("Section");
}

/** Tasks in a deleted section stay in the project, without a section. */
export async function deleteSection(sectionId: number) {
  await db.delete(sections).where(eq(sections.id, sectionId));
}

/** New order of a project's sections. */
export async function reorderSections(input: { projectId: number; ids: number[] }) {
  const data = z.object({ projectId: s.id, ids: z.array(s.id).max(200) }).parse(input);
  const existing = await db.select({ id: sections.id }).from(sections).where(eq(sections.projectId, data.projectId));
  const known = new Set(existing.map((r) => r.id));
  if (data.ids.some((id) => !known.has(id))) invalid("Section is not in this project");
  await db.transaction(async (tx) => {
    for (const [i, id] of data.ids.entries()) {
      await tx.update(sections).set({ position: i + 1 }).where(eq(sections.id, id));
    }
  });
}

/** Money linked to the project (directly or through its tasks), per currency. */
export async function projectMoney(projectId: number) {
  const rows = await db
    .select({
      currency: transactions.currency,
      direction: transactions.direction,
      settled: sql<boolean>`${transactions.settledAt} is not null`,
      total: sql<string>`sum(${transactions.amount})`,
    })
    .from(transactions)
    .leftJoin(tasks, eq(tasks.id, transactions.taskId))
    .where(
      and(
        isNull(transactions.transferId),
        sql`(${transactions.projectId} = ${projectId} or ${tasks.projectId} = ${projectId})`,
      ),
    )
    .groupBy(transactions.currency, transactions.direction, sql`${transactions.settledAt} is not null`);

  const map = new Map<CurrencyCode, { currency: CurrencyCode; costPlanned: number; costPaid: number; incomePlanned: number; incomeReceived: number }>();
  for (const r of rows) {
    const m = map.get(r.currency) ?? { currency: r.currency, costPlanned: 0, costPaid: 0, incomePlanned: 0, incomeReceived: 0 };
    const v = Number(r.total);
    if (r.direction === "out") {
      if (r.settled) m.costPaid += v;
      else m.costPlanned += v;
    } else if (r.settled) m.incomeReceived += v;
    else m.incomePlanned += v;
    map.set(r.currency, m);
  }
  return [...map.values()];
}

