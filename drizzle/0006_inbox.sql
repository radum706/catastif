CREATE TYPE "public"."inbox_kind" AS ENUM('task', 'transaction', 'unknown');--> statement-breakpoint
CREATE TYPE "public"."inbox_source" AS ENUM('manual', 'phone', 'email', 'n8n', 'api', 'chat');--> statement-breakpoint
CREATE TYPE "public"."inbox_status" AS ENUM('pending', 'approved', 'rejected');--> statement-breakpoint
CREATE TABLE "inbox_items" (
	"id" integer PRIMARY KEY GENERATED ALWAYS AS IDENTITY (sequence name "inbox_items_id_seq" INCREMENT BY 1 MINVALUE 1 MAXVALUE 2147483647 START WITH 1 CACHE 1),
	"source" "inbox_source" DEFAULT 'manual' NOT NULL,
	"workspace" "workspace",
	"raw_text" text NOT NULL,
	"kind" "inbox_kind" DEFAULT 'unknown' NOT NULL,
	"draft" jsonb,
	"extractor" text,
	"error" text,
	"status" "inbox_status" DEFAULT 'pending' NOT NULL,
	"result_type" text,
	"result_id" integer,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"resolved_at" timestamp with time zone
);
--> statement-breakpoint
CREATE INDEX "inbox_items_status_idx" ON "inbox_items" USING btree ("status","created_at");