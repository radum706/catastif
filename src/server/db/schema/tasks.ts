import { sql } from "drizzle-orm";
import {
  boolean,
  check,
  date,
  doublePrecision,
  foreignKey,
  index,
  integer,
  jsonb,
  pgEnum,
  pgTable,
  primaryKey,
  text,
  time,
  timestamp,
  unique,
  uniqueIndex,
  type AnyPgColumn,
} from "drizzle-orm/pg-core";
import { timestamps, workspaceEnum } from "./common";

export const projectStatusEnum = pgEnum("project_status", ["active", "on_hold", "done", "archived"]);
export const priorityEnum = pgEnum("priority", ["none", "low", "medium", "high"]);
export const taskActivityKindEnum = pgEnum("task_activity_kind", [
  "comment",
  "created",
  "completed",
  "reopened",
  "updated",
  "moved",
]);

const day = (name: string) => date(name, { mode: "string" });

export const projects = pgTable(
  "projects",
  {
    id: integer("id").primaryKey().generatedAlwaysAsIdentity(),
    workspace: workspaceEnum("workspace").notNull(),
    name: text("name").notNull(),
    description: text("description"),
    color: text("color").notNull().default("teal"),
    status: projectStatusEnum("status").notNull().default("active"),
    startDate: day("start_date"),
    dueDate: day("due_date"),
    position: doublePrecision("position").notNull().default(0),
    ...timestamps,
  },
  (t) => [
    unique("projects_id_workspace_uq").on(t.id, t.workspace),
    index("projects_workspace_idx").on(t.workspace, t.status),
  ],
);

/** Sections split a project's list and are the columns of its board. */
export const sections = pgTable(
  "sections",
  {
    id: integer("id").primaryKey().generatedAlwaysAsIdentity(),
    projectId: integer("project_id")
      .notNull()
      .references(() => projects.id, { onDelete: "cascade" }),
    name: text("name").notNull(),
    position: doublePrecision("position").notNull().default(0),
    ...timestamps,
  },
  (t) => [index("sections_project_idx").on(t.projectId, t.position)],
);

export const tasks = pgTable(
  "tasks",
  {
    id: integer("id").primaryKey().generatedAlwaysAsIdentity(),
    workspace: workspaceEnum("workspace").notNull(),
    projectId: integer("project_id"),
    sectionId: integer("section_id").references(() => sections.id, { onDelete: "set null" }),
    parentId: integer("parent_id").references((): AnyPgColumn => tasks.id, { onDelete: "cascade" }),
    title: text("title").notNull(),
    notes: text("notes"),
    priority: priorityEnum("priority").notNull().default("none"),
    startDate: day("start_date"),
    dueDate: day("due_date"),
    dueTime: time("due_time"),
    estimateMinutes: integer("estimate_minutes"),
    completed: boolean("completed").notNull().default(false),
    completedAt: timestamp("completed_at", { withTimezone: true }),
    position: doublePrecision("position").notNull().default(0),
    ...timestamps,
  },
  (t) => [
    // Moving a project to the other workspace moves its tasks.
    foreignKey({
      name: "tasks_project_workspace_fk",
      columns: [t.projectId, t.workspace],
      foreignColumns: [projects.id, projects.workspace],
    })
      .onDelete("cascade")
      .onUpdate("cascade"),
    check("tasks_section_needs_project", sql`${t.sectionId} is null or ${t.projectId} is not null`),
    check("tasks_completed_at", sql`${t.completed} = (${t.completedAt} is not null)`),
    check("tasks_dates_ordered", sql`${t.startDate} is null or ${t.dueDate} is null or ${t.startDate} <= ${t.dueDate}`),
    check("tasks_estimate_positive", sql`${t.estimateMinutes} is null or ${t.estimateMinutes} > 0`),
    index("tasks_workspace_due_idx").on(t.workspace, t.completed, t.dueDate),
    index("tasks_project_idx").on(t.projectId, t.sectionId, t.position),
    index("tasks_parent_idx").on(t.parentId),
  ],
);

export const tags = pgTable(
  "tags",
  {
    id: integer("id").primaryKey().generatedAlwaysAsIdentity(),
    workspace: workspaceEnum("workspace").notNull(),
    name: text("name").notNull(),
    color: text("color").notNull().default("slate"),
  },
  (t) => [uniqueIndex("tags_ws_name_uq").on(t.workspace, sql`lower(${t.name})`)],
);

export const taskTags = pgTable(
  "task_tags",
  {
    taskId: integer("task_id")
      .notNull()
      .references(() => tasks.id, { onDelete: "cascade" }),
    tagId: integer("tag_id")
      .notNull()
      .references(() => tags.id, { onDelete: "cascade" }),
  },
  (t) => [primaryKey({ columns: [t.taskId, t.tagId] }), index("task_tags_tag_idx").on(t.tagId)],
);

/** Comments and the automatic history of a task, in one timeline. */
export const taskActivity = pgTable(
  "task_activity",
  {
    id: integer("id").primaryKey().generatedAlwaysAsIdentity(),
    taskId: integer("task_id")
      .notNull()
      .references(() => tasks.id, { onDelete: "cascade" }),
    kind: taskActivityKindEnum("kind").notNull(),
    body: text("body"),
    data: jsonb("data").$type<Record<string, unknown>>(),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [index("task_activity_task_idx").on(t.taskId, t.createdAt)],
);

export type Project = typeof projects.$inferSelect;
export type Section = typeof sections.$inferSelect;
export type Task = typeof tasks.$inferSelect;
export type Tag = typeof tags.$inferSelect;
export type TaskActivity = typeof taskActivity.$inferSelect;
export type Priority = (typeof priorityEnum.enumValues)[number];
export type ProjectStatus = (typeof projectStatusEnum.enumValues)[number];
