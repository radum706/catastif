# Catastif

Personal, self-hosted organiser: money first, then tasks, resources, memory and an AI inbox.
Single user, runs on Unraid with Docker Compose, reachable over Tailscale.

**Status:** Phase 1 (Money) done.

## What Phase 1 does

- **Accounts** in EUR or RON (bank, cash, card, other) with an opening balance.
- **Transactions** have a name, an amount, and a status that follows the money:
  - money out: `upcoming → paid`
  - money in: `upcoming → invoiced → received` (salary skips `invoiced`)
- **Bills:** unpaid money out, grouped as overdue / due in 7 days / next 45 days, with one-tap **Paid**.
- **To collect:** money in you're waiting for, with how long an invoice has been waiting. One tap marks it **Received**.
- **Recurring rules** (salary, rent, subscriptions) create upcoming entries 12 months ahead. Beyond that, the forecast calculates them on the fly.
- **Forecast:** balance at any date, per account and per currency, with a chart and the lowest point.
- **Safe to spend:** balance minus the bills due before your next income.
- **Quick add:** one line, parsed locally with a live preview (no AI):

  | You type | Result |
  |---|---|
  | `-45 Lidl food` | money out, paid today |
  | `+4500 salary` | money in, received today |
  | `-230 Enel unpaid @15` | bill due on the 15th |
  | `-60 fuel #car yesterday` | category via `#tag`, dated yesterday |

  If the text matches a **payee**, it fills in that payee's default category, account and context.
- **Transfers** between accounts, including EUR → RON with two different amounts. They never count as income or expense.

Catastif does not issue invoices. It only tracks whether money was invoiced and whether it was paid.

## Run it on Unraid

```bash
git clone … /mnt/user/appdata/catastif-src && cd /mnt/user/appdata/catastif-src
cp .env.example .env
# Set these in .env:
#   POSTGRES_PASSWORD   (openssl rand -hex 24)
#   SETUP_TOKEN         (openssl rand -hex 16)
#   TAILSCALE_IP        (tailscale ip -4)
#   DATA_DIR, BACKUP_DIR
docker compose up -d --build
```

| Service | What it does | Where |
|---|---|---|
| `app` | Next.js UI; runs migrations on start | `http://$TAILSCALE_IP:3000` |
| `worker` | Nightly jobs (recurring rules, session cleanup; later ntfy) | none |
| `db` | Postgres 16 + pgvector | internal only |
| `adminer` | Database GUI | `http://$TAILSCALE_IP:8081` (server `db`) |
| `backup` | Nightly `pg_dump` into `BACKUP_DIR` | none |

**First visit:** open `/login`, enter `SETUP_TOKEN` and choose a password (12+ characters). Then:
1. Add accounts.
2. Click **Add starter categories**.
3. Add payees and recurring rules.

**Forgot the password:** in Adminer, delete the row in `app_user`. The setup screen comes back.

**HTTPS:** with `tailscale serve`, set `COOKIE_SECURE=true`.

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
  app/            UI pages (thin; they call the API)
  server/api/     typed internal API: the one entry point for UI, MCP and webhooks
  server/actions/ server actions (form → API)
  server/auth/    password + DB sessions
  server/db/      Drizzle schema and client
  lib/            pure helpers: money, dates, recurrence, quick-add parser
  i18n/en.ts      every UI string
worker/           scheduled jobs
drizzle/          committed migrations
docker/backup/    backup script
```

## Data rules

- **Money:** amounts are integers in minor units (cents or bani) and always positive; the direction is `in` or `out`.
- **Currency:** each transaction's currency must equal its account's currency (composite FK). Totals are per currency, with no FX conversion.
- **Status:** the database rejects a status that doesn't fit the direction.
- **Dates:** `date` is the cash date, i.e. when money moved or is expected to move. Marking a transaction paid or received sets both `date` and `settled_at`.
- **Editing a recurring rule:** its future upcoming entries are rewritten. Past and settled entries are kept.

## Roadmap

1. ~~Money~~
2. Projects and tasks, "to do before date X"
3. Resources (people and tools) and materials, cost rollup
4. Memory: notes, embeddings, semantic search
5. MCP server (writes become Inbox drafts)
6. Phone capture webhook and ntfy reminders
