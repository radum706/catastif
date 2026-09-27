CREATE TYPE "public"."workspace" AS ENUM('personal', 'work');--> statement-breakpoint
DROP INDEX "categories_kind_name_uq";--> statement-breakpoint
DROP INDEX "payees_name_uq";--> statement-breakpoint
ALTER TABLE "accounts" ADD COLUMN "workspace" "workspace" DEFAULT 'personal' NOT NULL;--> statement-breakpoint
ALTER TABLE "categories" ADD COLUMN "workspace" "workspace" DEFAULT 'personal' NOT NULL;--> statement-breakpoint
ALTER TABLE "payees" ADD COLUMN "workspace" "workspace" DEFAULT 'personal' NOT NULL;--> statement-breakpoint
ALTER TABLE "recurring_rules" ADD COLUMN "workspace" "workspace" DEFAULT 'personal' NOT NULL;--> statement-breakpoint
ALTER TABLE "transactions" ADD COLUMN "workspace" "workspace" DEFAULT 'personal' NOT NULL;--> statement-breakpoint
ALTER TABLE "accounts" ADD CONSTRAINT "accounts_id_workspace_uq" UNIQUE("id","workspace");--> statement-breakpoint
ALTER TABLE "recurring_rules" ADD CONSTRAINT "recurring_rules_account_workspace_fk" FOREIGN KEY ("account_id","workspace") REFERENCES "public"."accounts"("id","workspace") ON DELETE cascade ON UPDATE cascade;--> statement-breakpoint
ALTER TABLE "transactions" ADD CONSTRAINT "transactions_account_workspace_fk" FOREIGN KEY ("account_id","workspace") REFERENCES "public"."accounts"("id","workspace") ON DELETE cascade ON UPDATE cascade;--> statement-breakpoint
CREATE UNIQUE INDEX "categories_ws_kind_name_uq" ON "categories" USING btree ("workspace","kind",lower("name"));--> statement-breakpoint
CREATE UNIQUE INDEX "payees_ws_name_uq" ON "payees" USING btree ("workspace",lower("name"));