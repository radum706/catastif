# Integrations

Catastif has a small REST API, signed outgoing webhooks and an iCal feed.
n8n, phone shortcuts, scripts and (later) the MCP server all use the same API as the UI.

Set everything up in **Settings → Integrations**.

## Tokens

Send a token with each request:

```
Authorization: Bearer cat_xxxxxxxx
```

`X-Api-Key: cat_…` works as well.

| Scope | What it allows |
|---|---|
| `read` | Read everything the token can see. |
| `write` | Create, change and delete. Includes `read` and `inbox`. |
| `inbox` | Only send drafts to the Inbox (for AI and capture). |
| `calendar` | The iCal feed. It's the only scope that also accepts `?token=` in the URL. |

A token can be limited to one workspace (**Personal** or **Work**). A limited token:
- only ever sees that workspace;
- gets **403** if it touches anything in the other one.

## Endpoints

- All bodies are JSON.
- Money amounts are **integers in minor units**: `4590` = 45.90.
- Dates are `YYYY-MM-DD`.
- `workspace` is `personal` or `work`.

| Method | Path | Notes |
|---|---|---|
| GET | `/api/v1/me` | Token name, scopes, workspace |
| GET | `/api/v1/tasks` | `?workspace=&projectId=&completed=&dueFrom=&dueTo=&q=&subtasks=1&limit=` |
| POST | `/api/v1/tasks` | `{ "text": "Call accountant tomorrow 14:00 !high #admin", "workspace": "work" }` or `{ title, workspace \| projectId \| sectionId \| parentId, dueDate, dueTime, priority, notes, tags }` |
| GET / PATCH / DELETE | `/api/v1/tasks/:id` | GET includes subtasks, activity and linked transactions |
| POST | `/api/v1/tasks/:id/complete` | `{ "completed": false }` reopens the task |
| POST | `/api/v1/tasks/:id/comments` | `{ "body": "…" }` |
| GET / POST | `/api/v1/projects` | POST: `{ name, workspace, template: "board" \| "list" \| "empty", color, dueDate }` |
| GET | `/api/v1/projects/:id` | Sections and money roll-up |
| GET | `/api/v1/transactions` | `?workspace=&from=&to=&accountId=&projectId=&direction=&status=upcoming,invoiced&q=` |
| POST | `/api/v1/transactions` | `{ title, direction, amount, accountId, status?, date?, dueDate?, categoryId?, payeeId?, projectId?, taskId? }` or quick add `{ "text": "-45,90 Lidl food", "workspace": "personal", "accountId": 3 }` |
| GET / PATCH / DELETE | `/api/v1/transactions/:id` | |
| POST | `/api/v1/transactions/:id/settle` | Bill paid / income received. `{ date?, amount? }` |
| GET | `/api/v1/accounts` | Accounts, categories and payees (the ids you need for POSTs) |
| GET | `/api/v1/bills` | Open bills by urgency, plus money to collect |
| GET | `/api/v1/balance` | `?date=&workspace=`: balance per account and currency, and safe to spend |
| GET | `/api/v1/todo-before` | `?date=`: open tasks and money due by that date |
| GET | `/api/v1/calendar` | `?from=&to=&workspace=&paid=1`: the same items as the Calendar page |
| GET | `/api/v1/ical` | `?token=&workspace=`: subscribe from Google, Apple or Outlook calendar |

Errors come back as `{ "error": "…" }` with one of these statuses:

| Status | Meaning |
|---|---|
| 400 | Invalid input. The response also includes `issues`. |
| 401 | No token, or an unknown token. |
| 403 | Missing scope, or the other workspace. |
| 404 | Not found. |

```bash
curl -s -H "Authorization: Bearer $CATASTIF_TOKEN" \
  -H 'content-type: application/json' \
  -d '{"text":"Order tiles fri !high #site","workspace":"work"}' \
  http://100.x.y.z:3000/api/v1/tasks
```

## Webhooks

Catastif `POST`s JSON to your URL when something happens.

**How delivery works:**
- Deliveries go through an outbox, and the worker sends them within about 15 seconds.
- A failed delivery is retried after 1 min, 5 min, 30 min, 2 h and 12 h. After that it is marked failed; you can retry it by hand in Settings.
- A webhook can be limited to one workspace.

**Events:**

| Event | Sent when |
|---|---|
| `task.created`, `task.updated`, `task.completed`, `task.reopened`, `task.deleted` | A task changes |
| `project.created` | A project is created |
| `transaction.created`, `transaction.updated`, `transaction.settled`, `transaction.deleted` | A transaction changes |
| `bill.overdue`, `task.overdue` | Once a day at `DIGEST_CRON` (default 08:00), one event per workspace listing everything late |
| `ping` | You press **Send test** |

**Body:**

```json
{
  "id": 123,
  "event": "task.created",
  "workspace": "work",
  "occurredAt": "2026-09-27T17:20:00.000Z",
  "data": { "task": { "id": 42, "title": "Order tiles", "dueDate": "2026-10-02" }, "tags": ["site"] }
}
```

**Headers:**
- `X-Catastif-Event`
- `X-Catastif-Delivery`: the delivery id
- `X-Catastif-Timestamp`
- `X-Catastif-Signature`

The signature is:

```
sha256=hex(HMAC_SHA256(secret, `${timestamp}.${rawBody}`))
```

### Checking the signature in n8n

In the **Webhook** node, turn on **Raw Body**. Then add a **Code** node:

```js
const crypto = require('crypto');
const secret = 'whsec_…'; // from Settings → Integrations
const h = $input.first().json.headers;
const raw = Buffer.from($input.first().binary.data.data, 'base64').toString('utf8');
const expected = 'sha256=' + crypto.createHmac('sha256', secret).update(`${h['x-catastif-timestamp']}.${raw}`).digest('hex');
if (expected !== h['x-catastif-signature']) throw new Error('Bad signature');
if (Math.abs(Date.now() / 1000 - Number(h['x-catastif-timestamp'])) > 300) throw new Error('Too old');
return [{ json: JSON.parse(raw) }];
```

## n8n in the same stack

```bash
docker compose --profile n8n up -d     # n8n on http://$TAILSCALE_IP:5678
```

Inside the stack, the two containers reach each other by service name:
- **n8n → Catastif:** call `http://app:3000/api/v1/…` using an HTTP Request node with a *Header Auth* credential (`Authorization: Bearer cat_…`).
- **Catastif → n8n:** point webhooks at `http://n8n:5678/webhook/<path>`, using the production URL of a Webhook node.

### Recipes

- **Morning brief**
  1. A Catastif webhook on `bill.overdue` and `task.overdue` feeds an n8n workflow.
  2. The workflow formats the list and sends it by ntfy, Telegram or email.
- **Email to task**
  1. An IMAP trigger reads new mail.
  2. An HTTP Request node posts `{ "text": "{{subject}}", "workspace": "work" }` to `/api/v1/tasks`. Once the Inbox exists, send it to `/api/v1/inbox` instead, so AI drafts it and you approve it.
- **Paid-invoice notice**
  1. A webhook on `transaction.settled` feeds n8n.
  2. An IF node checks `data.transaction.direction == "in"`.
  3. n8n sends a message.
- **Bank emails / CSV**
  1. n8n parses the email or file.
  2. It calls `POST /api/v1/transactions` with `status: "paid"`.
- **Phone quick add** (iOS Shortcuts / Tasker): an HTTP POST to `/api/v1/transactions` with `{ "text": "-45 Lidl", "workspace": "personal" }` or to `/api/v1/tasks` with `{ "text": "…" }`.

## Calendar feed

1. Create a token with the `calendar` scope.
2. Subscribe your calendar app to:

```
http://<host>/api/v1/ical?token=cat_…               # both workspaces
http://<host>/api/v1/ical?token=cat_…&workspace=work
```

- **Range:** the last 30 days to 180 days ahead.
- **What's in it:** open tasks (timed tasks use their estimate as the duration), bills 💸, expected income 💰, recurring entries ↻ and project deadlines ⚑.
- **Google Calendar** needs a publicly reachable URL: expose only this path through Caddy.
