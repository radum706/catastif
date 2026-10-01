# Catastif

A personal, self-hosted organiser for work and personal life: Asana-style tasks, money, a calendar, and an AI inbox.
It's single-user, runs on Unraid with Docker Compose, and you reach it over Tailscale.

## Workspaces

**Personal** and **Work** are kept separate.

- Every account, category, payee, project and task belongs to exactly one workspace.
- The database refuses to mix them. For example, a work expense can't use a personal category.
- The switcher at the top sets which workspace Tasks, Money and Settings show. Work has its own accent colour.
- **Home** and **Calendar** can show both workspaces at once. Each item carries a P or W badge.
- Money totals are never added across workspaces.
- Transfers between workspaces are allowed, e.g. paying yourself from the business account.

## Modules

**Home.** Today's and overdue tasks, the next 7 days, and safe-to-spend for each workspace.

**Tasks** (like Asana):
- **My tasks:** Overdue / Today / Next 7 days / Later / No date.
- **Projects** have sections. Each project has three views:
  - **List**
  - **Board:** drag cards between sections. On a phone, a column picker replaces dragging.
  - **Calendar**
- **Tasks** have subtasks, priority, start/due date and time, an estimate, tags, comments, and an activity log.
- **Linked money:** a task can have planned costs or expected income attached. Projects add these up.
- **Before date:** open tasks plus bills and income due by a date.
- **One-line add:** `Call accountant tomorrow 14:00 !high #admin`.

**Money:**
- Accounts in EUR or RON.
- Transactions follow a status: money out goes `upcoming → paid`; money in goes `upcoming → invoiced → received`.
- **Bills** you owe, with overdue / due soon, and one-tap **Paid**.
- **To collect:** money you're waiting for, with how long each invoice has been waiting.
- **Recurring rules** plan 12 months ahead.
- **Forecast:** balance at any date, with a chart.
- **Safe to spend:** balance minus the bills due before your next income.
- **Quick add** (`-45 Lidl food`, `+4500 salary`) and transfers, including EUR ↔ RON.

**Calendar:**
- Month and week views showing tasks, bills, expected income, recurring entries and project deadlines.
- Drag to reschedule. Phones get an agenda list instead.
- Filter by All / Personal / Work.
- There's also an iCal feed for your phone's calendar.

**Inbox:**
- Text from your phone, n8n, email or the capture box becomes an AI draft (a task or a transaction). You edit it and approve it with one tap.
- **Rule: AI never writes real data directly.**
- AI uses Claude Haiku (`LLM_MODEL`). Bank, card, ID and phone numbers and e-mail addresses are removed before anything is sent.
- If the model is unavailable, or `LLM_PROVIDER=parser`, the local one-line parsers draft instead.

**Claude connector (MCP):**
- Claude (the app, desktop, or Claude Code) can read your tasks, money and calendar, and draft items into the Inbox.
- It can change existing items only if you allow it.
- You connect with OAuth from the Claude app's **Add custom connector**, or with a token.
- Details: [docs/MCP.md](docs/MCP.md).

**Integrations** (Settings → Integrations):
- API tokens with scopes, optionally limited to one workspace.
- REST API `/api/v1`.
- Signed webhooks for n8n, retried until delivered, plus a daily overdue digest.
- iCal feed.
- n8n as an optional container.
- Details: [docs/INTEGRATIONS.md](docs/INTEGRATIONS.md).

Catastif does not issue legal invoices. It only tracks whether money was invoiced and whether it was paid.

## Branches

| Branch | What it's for |
|---|---|
| `main` | Development: all code, tests and tooling. |
| `release` | Only what the server needs to build and run (the paths listed in `release.files`). Deploy from this branch. |

`release` is generated from `main` and never edited by hand. To update it, do one of these:
- On GitHub, go to **Actions → Release → Run workflow**.
- Push a tag: `git tag v0.3.0 && git push origin v0.3.0`.
- Run it locally: `scripts/make-release.sh && git push origin release`.

## Run it on Unraid

```bash
git clone -b release https://github.com/radum706/catastif.git /mnt/user/appdata/catastif-src
cd /mnt/user/appdata/catastif-src
cp .env.example .env
# Set these in .env:
#   POSTGRES_PASSWORD   (openssl rand -hex 24)
#   SETUP_TOKEN         (openssl rand -hex 16)
#   TAILSCALE_IP        (tailscale ip -4)
#   DATA_DIR, BACKUP_DIR
docker compose up -d --build
```

To update later, run `git pull && docker compose up -d --build`.

| Service | What it does | Where |
|---|---|---|
| `app` | Next.js UI; runs migrations on start | `http://$TAILSCALE_IP:3000` |
| `worker` | Recurring rules, webhook delivery (every 15 s), 08:00 overdue digest, cleanup | none |
| `db` | Postgres 16 + pgvector | internal only |
| `adminer` | Database GUI | `http://$TAILSCALE_IP:8081` (server `db`) |
| `backup` | Nightly `pg_dump` into `BACKUP_DIR` | none |
| `n8n` (optional) | `docker compose --profile n8n up -d` | `http://$TAILSCALE_IP:5678` |

**First visit:** open `/login`, enter `SETUP_TOKEN` and choose a password (12+ characters). Then, **for each workspace** (switch at the top):
1. Add accounts.
2. Click **Add starter categories**.
3. Add payees and recurring rules.

**AI drafts:** set `ANTHROPIC_API_KEY` in `.env`.

**Forgot the password:** in Adminer, delete the row in `app_user`. The setup screen comes back.

**HTTPS:** with `tailscale serve`, set `COOKIE_SECURE=true`.

**Deploying with Dockhand / Portainer (stack from git):** point it at the `release` branch and set the variables from `.env.example` in the tool's environment settings. The app image is rebuilt on every deploy (`pull_policy: build`), so the first deploy and each update take a few minutes.

**If the app container is "unhealthy":** run `docker compose logs app`. Lines starting with `[migrate]` explain database problems. The most common one is a `POSTGRES_PASSWORD` changed after the first start: Postgres keeps the password from its first run.

**Always-on:** the worker runs its catch-up job on start. If the server was off at night, nothing is missed.

## Backups

- `backup` writes `catastif_YYYY-MM-DD_HHMM.dump` (pg_dump custom format) to `BACKUP_DIR` every day at `BACKUP_HOUR`.
- It keeps `BACKUP_KEEP_DAYS` days of dumps.
- Sync that folder off-site with rclone or an Unraid backup plugin.

```bash
docker compose run --rm backup now      # take a backup right now

# restore into an empty database
docker compose exec -T db pg_restore --clean --if-exists --no-owner \
  -U catastif -d catastif < /path/to/catastif_2026-09-27_0300.dump
```

## Development

Needs Node 22 and Postgres 16 running locally.

```bash
npm install
cp .env.example .env      # point DATABASE_URL / TEST_DATABASE_URL at localhost
npm run db:migrate
npm run dev               # http://localhost:3000
npm run worker            # optional
npm test                  # unit + integration (integration needs TEST_DATABASE_URL)
npm run lint && npm run typecheck
```

After changing the schema: `npm run db:generate -- --name what_changed`, then commit the SQL in `drizzle/`.

## Layout

```
src/
  app/(app)/        UI: / (home), tasks/, money/, calendar/, inbox/, settings/
  app/api/v1/       REST API for n8n, phone shortcuts, calendar apps
  app/api/mcp/      MCP endpoint for Claude; app/api/oauth/ is its OAuth server
  server/mcp/       MCP tools (one server per request, bound to the caller's token)
  server/api/       typed internal API: the one entry point for UI, REST, webhooks and MCP
  server/llm/       the only code that talks to a model (provider set by LLM_PROVIDER)
  server/actions/   server actions (form → API)
  server/db/schema/ Drizzle schema (common, money, tasks, integrations, inbox)
  lib/              pure helpers: money, dates, recurrence, one-line parsers, iCal
  i18n/en.ts        every UI string
worker/             scheduled jobs and webhook delivery
drizzle/            committed migrations
docs/               INTEGRATIONS.md
```

## Data rules

- **Money:** amounts are integers in minor units (cents or bani) and always positive; the direction is `in` or `out`.
- **Currency and workspace:** each transaction's currency and workspace must equal its account's (composite FKs). Totals are per currency and per workspace, with no FX conversion.
- **Status:** the database rejects a status that doesn't fit the direction.
- **Dates:** `date` is the cash date, i.e. when money moved or is expected to move. Marking a transaction paid or received sets both `date` and `settled_at`.
- **Editing a recurring rule:** its future upcoming entries are rewritten. Past and settled entries are kept.

## Roadmap

1. ~~Money~~
2. ~~Workspaces, Asana-style tasks, calendar~~
3. ~~Integrations: REST, webhooks, n8n, iCal; Inbox with AI drafts~~
4. Resources (people and tools) and materials, cost roll-up
5. Memory: notes, embeddings, semantic search
6. ~~MCP server for the Claude app (writes become Inbox drafts)~~
7. ntfy reminders, recurring tasks, bank CSV import
