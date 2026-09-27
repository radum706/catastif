ALTER TABLE "accounts" DROP COLUMN "context";--> statement-breakpoint
ALTER TABLE "payees" DROP COLUMN "default_context";--> statement-breakpoint
ALTER TABLE "recurring_rules" DROP COLUMN "context";--> statement-breakpoint
ALTER TABLE "transactions" DROP COLUMN "context";--> statement-breakpoint
DROP TYPE "public"."context";