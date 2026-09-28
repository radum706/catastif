-- Move existing data from the old per-row "context" into workspaces.
-- Accounts decide: their transactions and rules follow them (FK ON UPDATE CASCADE).
UPDATE "accounts" SET "workspace" = "context"::text::"workspace";--> statement-breakpoint

-- Categories: every existing category also gets a copy in the work workspace.
INSERT INTO "categories" ("name", "kind", "workspace", "archived")
SELECT "name", "kind", 'work', "archived" FROM "categories" WHERE "workspace" = 'personal'
ON CONFLICT DO NOTHING;--> statement-breakpoint
UPDATE "categories" AS c SET "parent_id" = wp."id"
FROM "categories" AS pp, "categories" AS wp, "categories" AS pc
WHERE c."workspace" = 'work' AND pc."workspace" = 'personal'
  AND pc."kind" = c."kind" AND lower(pc."name") = lower(c."name")
  AND pp."id" = pc."parent_id"
  AND wp."workspace" = 'work' AND wp."kind" = pp."kind" AND lower(wp."name") = lower(pp."name");--> statement-breakpoint

-- Payees: copy any payee used by work records into the work workspace.
INSERT INTO "payees" ("name", "workspace", "default_direction", "notes")
SELECT p."name", 'work', p."default_direction", p."notes" FROM "payees" p
WHERE p."id" IN (
  SELECT "payee_id" FROM "transactions" WHERE "workspace" = 'work' AND "payee_id" IS NOT NULL
  UNION SELECT "payee_id" FROM "recurring_rules" WHERE "workspace" = 'work' AND "payee_id" IS NOT NULL
) OR p."default_context" = 'work'
ON CONFLICT DO NOTHING;--> statement-breakpoint

-- Point work records at the work copies.
UPDATE "transactions" t SET "category_id" = wc."id"
FROM "categories" pc, "categories" wc
WHERE t."workspace" = 'work' AND t."category_id" = pc."id" AND pc."workspace" = 'personal'
  AND wc."workspace" = 'work' AND wc."kind" = pc."kind" AND lower(wc."name") = lower(pc."name");--> statement-breakpoint
UPDATE "recurring_rules" t SET "category_id" = wc."id"
FROM "categories" pc, "categories" wc
WHERE t."workspace" = 'work' AND t."category_id" = pc."id" AND pc."workspace" = 'personal'
  AND wc."workspace" = 'work' AND wc."kind" = pc."kind" AND lower(wc."name") = lower(pc."name");--> statement-breakpoint
UPDATE "transactions" t SET "payee_id" = wp."id"
FROM "payees" pp, "payees" wp
WHERE t."workspace" = 'work' AND t."payee_id" = pp."id" AND pp."workspace" = 'personal'
  AND wp."workspace" = 'work' AND lower(wp."name") = lower(pp."name");--> statement-breakpoint
UPDATE "recurring_rules" t SET "payee_id" = wp."id"
FROM "payees" pp, "payees" wp
WHERE t."workspace" = 'work' AND t."payee_id" = pp."id" AND pp."workspace" = 'personal'
  AND wp."workspace" = 'work' AND lower(wp."name") = lower(pp."name");--> statement-breakpoint

-- Payee defaults must stay inside the payee's workspace.
UPDATE "payees" wp SET "default_category_id" = wc."id"
FROM "payees" pp, "categories" pc, "categories" wc
WHERE wp."workspace" = 'work' AND pp."workspace" = 'personal' AND lower(pp."name") = lower(wp."name")
  AND pc."id" = pp."default_category_id"
  AND wc."workspace" = 'work' AND wc."kind" = pc."kind" AND lower(wc."name") = lower(pc."name");--> statement-breakpoint
UPDATE "payees" wp SET "default_account_id" = pp."default_account_id"
FROM "payees" pp, "accounts" a
WHERE wp."workspace" = 'work' AND pp."workspace" = 'personal' AND lower(pp."name") = lower(wp."name")
  AND a."id" = pp."default_account_id" AND a."workspace" = 'work';--> statement-breakpoint
UPDATE "payees" p SET "default_account_id" = NULL
FROM "accounts" a
WHERE a."id" = p."default_account_id" AND a."workspace" <> p."workspace";
