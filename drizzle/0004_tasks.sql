CREATE TYPE "public"."priority" AS ENUM('none', 'low', 'medium', 'high');--> statement-breakpoint
CREATE TYPE "public"."project_status" AS ENUM('active', 'on_hold', 'done', 'archived');--> statement-breakpoint
CREATE TYPE "public"."task_activity_kind" AS ENUM('comment', 'created', 'completed', 'reopened', 'updated', 'moved');--> statement-breakpoint
CREATE TABLE "projects" (
	"id" integer PRIMARY KEY GENERATED ALWAYS AS IDENTITY (sequence name "projects_id_seq" INCREMENT BY 1 MINVALUE 1 MAXVALUE 2147483647 START WITH 1 CACHE 1),
	"workspace" "workspace" NOT NULL,
	"name" text NOT NULL,
	"description" text,
	"color" text DEFAULT 'teal' NOT NULL,
	"status" "project_status" DEFAULT 'active' NOT NULL,
	"start_date" date,
	"due_date" date,
	"position" double precision DEFAULT 0 NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "projects_id_workspace_uq" UNIQUE("id","workspace")
);
--> statement-breakpoint
CREATE TABLE "sections" (
	"id" integer PRIMARY KEY GENERATED ALWAYS AS IDENTITY (sequence name "sections_id_seq" INCREMENT BY 1 MINVALUE 1 MAXVALUE 2147483647 START WITH 1 CACHE 1),
	"project_id" integer NOT NULL,
	"name" text NOT NULL,
	"position" double precision DEFAULT 0 NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "tags" (
	"id" integer PRIMARY KEY GENERATED ALWAYS AS IDENTITY (sequence name "tags_id_seq" INCREMENT BY 1 MINVALUE 1 MAXVALUE 2147483647 START WITH 1 CACHE 1),
	"workspace" "workspace" NOT NULL,
	"name" text NOT NULL,
	"color" text DEFAULT 'slate' NOT NULL
);
--> statement-breakpoint
CREATE TABLE "task_activity" (
	"id" integer PRIMARY KEY GENERATED ALWAYS AS IDENTITY (sequence name "task_activity_id_seq" INCREMENT BY 1 MINVALUE 1 MAXVALUE 2147483647 START WITH 1 CACHE 1),
	"task_id" integer NOT NULL,
	"kind" "task_activity_kind" NOT NULL,
	"body" text,
	"data" jsonb,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "task_tags" (
	"task_id" integer NOT NULL,
	"tag_id" integer NOT NULL,
	CONSTRAINT "task_tags_task_id_tag_id_pk" PRIMARY KEY("task_id","tag_id")
);
--> statement-breakpoint
CREATE TABLE "tasks" (
	"id" integer PRIMARY KEY GENERATED ALWAYS AS IDENTITY (sequence name "tasks_id_seq" INCREMENT BY 1 MINVALUE 1 MAXVALUE 2147483647 START WITH 1 CACHE 1),
	"workspace" "workspace" NOT NULL,
	"project_id" integer,
	"section_id" integer,
	"parent_id" integer,
	"title" text NOT NULL,
	"notes" text,
	"priority" "priority" DEFAULT 'none' NOT NULL,
	"start_date" date,
	"due_date" date,
	"due_time" time,
	"estimate_minutes" integer,
	"completed" boolean DEFAULT false NOT NULL,
	"completed_at" timestamp with time zone,
	"position" double precision DEFAULT 0 NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "tasks_section_needs_project" CHECK ("tasks"."section_id" is null or "tasks"."project_id" is not null),
	CONSTRAINT "tasks_completed_at" CHECK ("tasks"."completed" = ("tasks"."completed_at" is not null)),
	CONSTRAINT "tasks_dates_ordered" CHECK ("tasks"."start_date" is null or "tasks"."due_date" is null or "tasks"."start_date" <= "tasks"."due_date"),
	CONSTRAINT "tasks_estimate_positive" CHECK ("tasks"."estimate_minutes" is null or "tasks"."estimate_minutes" > 0)
);
--> statement-breakpoint
ALTER TABLE "sections" ADD CONSTRAINT "sections_project_id_projects_id_fk" FOREIGN KEY ("project_id") REFERENCES "public"."projects"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "task_activity" ADD CONSTRAINT "task_activity_task_id_tasks_id_fk" FOREIGN KEY ("task_id") REFERENCES "public"."tasks"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "task_tags" ADD CONSTRAINT "task_tags_task_id_tasks_id_fk" FOREIGN KEY ("task_id") REFERENCES "public"."tasks"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "task_tags" ADD CONSTRAINT "task_tags_tag_id_tags_id_fk" FOREIGN KEY ("tag_id") REFERENCES "public"."tags"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "tasks" ADD CONSTRAINT "tasks_section_id_sections_id_fk" FOREIGN KEY ("section_id") REFERENCES "public"."sections"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "tasks" ADD CONSTRAINT "tasks_parent_id_tasks_id_fk" FOREIGN KEY ("parent_id") REFERENCES "public"."tasks"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "tasks" ADD CONSTRAINT "tasks_project_workspace_fk" FOREIGN KEY ("project_id","workspace") REFERENCES "public"."projects"("id","workspace") ON DELETE cascade ON UPDATE cascade;--> statement-breakpoint
CREATE INDEX "projects_workspace_idx" ON "projects" USING btree ("workspace","status");--> statement-breakpoint
CREATE INDEX "sections_project_idx" ON "sections" USING btree ("project_id","position");--> statement-breakpoint
CREATE UNIQUE INDEX "tags_ws_name_uq" ON "tags" USING btree ("workspace",lower("name"));--> statement-breakpoint
CREATE INDEX "task_activity_task_idx" ON "task_activity" USING btree ("task_id","created_at");--> statement-breakpoint
CREATE INDEX "task_tags_tag_idx" ON "task_tags" USING btree ("tag_id");--> statement-breakpoint
CREATE INDEX "tasks_workspace_due_idx" ON "tasks" USING btree ("workspace","completed","due_date");--> statement-breakpoint
CREATE INDEX "tasks_project_idx" ON "tasks" USING btree ("project_id","section_id","position");--> statement-breakpoint
CREATE INDEX "tasks_parent_idx" ON "tasks" USING btree ("parent_id");--> statement-breakpoint
ALTER TABLE "transactions" ADD CONSTRAINT "transactions_project_id_projects_id_fk" FOREIGN KEY ("project_id") REFERENCES "public"."projects"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "transactions" ADD CONSTRAINT "transactions_task_id_tasks_id_fk" FOREIGN KEY ("task_id") REFERENCES "public"."tasks"("id") ON DELETE set null ON UPDATE no action;