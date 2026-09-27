@AGENTS.md

# Catastif: notes for agents

- Read README.md first. Single user, self-hosted, and every feature goes through `src/server/api/*`.
- Money is stored as integer minor units, always positive, with `direction` in/out. Never use floats.
- Dates are `YYYY-MM-DD` strings. Use the helpers in `src/lib/dates.ts`; "today" is in `APP_TZ`.
- UI strings live only in `src/i18n/en.ts`.
- Schema change: edit `src/server/db/schema/*`, run `npm run db:generate -- --name x`, and commit the SQL.
- Before committing: `npm run lint && npm run typecheck && npm test`.
- Every account, category, payee, project and task lives in one workspace (`personal` | `work`). Don't let them mix; check with the helpers in `src/server/api/workspace.ts`.
- AI never writes straight to real tables. Its output goes to the Inbox, and model calls go only through `src/server/llm`.
- API mutations that others may care about call `emit()` from `src/server/api/events.ts` (webhook outbox).
