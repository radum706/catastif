# Claude connector (MCP)

Catastif runs an MCP server at **`/api/mcp`** (Streamable HTTP). Through it, Claude can read your tasks, projects, money and calendar, and draft new items into your Inbox.

**The core rule still applies: anything Claude creates lands in the Inbox as a draft, and you approve it.** Changes to existing items (complete a task, mark a bill paid, reschedule, comment) are only possible if you grant **write** when connecting.

## Connect

### Claude app (claude.ai, desktop, mobile)

1. Set `PUBLIC_URL=https://catastif.example.com` in `.env` and expose the endpoint publicly (see below). The Claude app connects from Anthropic's servers, so a Tailscale-only address won't work.
2. In Claude go to **Settings → Connectors → Add custom connector**. Name it *Catastif* and set the URL to `https://catastif.example.com/api/mcp`.
3. Click **Connect**. Catastif's consent page opens. There you:
   1. choose what Claude may do (read / read + drafts / read + drafts + changes);
   2. choose which workspaces it can see;
   3. enter your Catastif password.
4. To disconnect, use **Settings → Integrations → Connected apps → Disconnect** in Catastif, or remove the connector in Claude.

Behind the scenes, Catastif is a small OAuth 2.1 server:
- Discovery: RFC 9728 and RFC 8414.
- Dynamic client registration: RFC 7591.
- PKCE with S256.
- Access tokens last 1 hour. Refresh tokens last 90 days and rotate on every use. If an old refresh token is reused, the app is disconnected.

### Claude Code

Create a token in **Settings → Integrations** with scopes `read` + `inbox` (add `write` if you want). This works over Tailscale; no public URL is needed.

```bash
claude mcp add --transport http catastif http://100.x.y.z:3000/api/mcp \
  --header "Authorization: Bearer cat_…"
```

### Other MCP clients

Any client that speaks Streamable HTTP works, with either a bearer token or OAuth. For a quick look, the MCP Inspector works too: `npx @modelcontextprotocol/inspector`.

## Exposing it publicly with Caddy (VPS → Gen8 over Tailscale)

Expose only the connector paths. The rest of Catastif stays Tailscale-only.

```caddy
catastif.example.com {
	@connector path /api/mcp /api/oauth/* /.well-known/oauth-protected-resource* /.well-known/oauth-authorization-server* /.well-known/openid-configuration
	handle @connector {
		reverse_proxy 100.x.y.z:3000   # the Gen8's Tailscale IP
	}
	handle {
		respond 404
	}
}
```

The consent page is self-contained, so `/login` and the rest of the app don't need to be public. Every connection asks for your password, and failed attempts slow down.

## Tools

| Tool | Scope | What it does |
|---|---|---|
| `get_overview` | read | Today, tasks due today or overdue, bills in the next 7 days, money to collect, safe-to-spend, Inbox count |
| `search_tasks` | read | Filter by workspace, status, project, due dates, text |
| `get_task` | read | Notes, subtasks, comments, history, linked money |
| `list_projects` / `get_project` | read | Projects with counts; sections, tasks and money roll-up |
| `todo_before` | read | Open tasks and money due by a date |
| `get_balance` | read | Balance per account and currency now and at a date (forecast) |
| `list_bills` | read | Open bills by urgency; money still to collect |
| `search_transactions` | read | Filter by date, text, direction, status, account, project |
| `get_calendar` | read | Everything dated between two dates |
| `list_money_setup` | read | Account, category and payee ids for drafts |
| `list_inbox` | read | Drafts waiting for approval |
| `draft_task` | inbox | Task draft into the Inbox |
| `draft_transaction` | inbox | Money draft into the Inbox (expense, bill, income) |
| `capture_to_inbox` | inbox | Free text; Catastif drafts it itself |
| `complete_task` | write | Mark a task done or not done |
| `update_task` | write | Due date and time, priority, title, notes |
| `comment_on_task` | write | Add a comment |
| `settle_transaction` | write | Mark a bill paid or income received |

**Workspace limit.** A connection limited to one workspace only sees that workspace. Asking it for the other one returns an error Claude can read.

**Example prompts:**
- "What's due this week at work?"
- "How much can I spend until salary?"
- "Draft the Enel bill, 230 lei, due on the 15th."
- "Plan the kitchen project: add tasks for measuring, ordering cabinets and installing the sink."
