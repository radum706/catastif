// MCP server: the tools Claude sees. One instance per request, bound to the caller's token,
// so scopes and the token's workspace limit apply to every call.
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import {
  accounts,
  calendar,
  categories,
  forecast,
  inbox,
  payees,
  payments,
  projects,
  tasks,
  transactions,
} from "@/server/api";
import { hasScope } from "@/server/api/integrations";
import { WORKSPACES } from "@/server/api/workspace";
import type { ApiToken, Workspace } from "@/server/db/schema";
import { addDays, isISODate, today } from "@/lib/dates";
import { parseAmount } from "@/lib/money";
import { money, task, tx, txRow } from "./format";

const INSTRUCTIONS = `Catastif is the user's personal organiser: tasks (Asana-style projects), money (accounts in EUR/RON, bills, expected income, forecasts) and an Inbox.

Rules:
- Two separate workspaces: "personal" and "work". Never mix them; pass workspace when the user's request is clearly about one.
- Anything you create goes to the Inbox as a draft (draft_task, draft_transaction, capture_to_inbox). The user approves it in Catastif; say so when you create one. You cannot approve drafts.
- Money: amounts in tool inputs are decimal strings in the account's currency ("45.90"). Results show both minor units and a display string.
- Dates are YYYY-MM-DD in the user's timezone. Use get_overview first when you need today's date or a summary.
- Look up ids with list_money_setup (accounts, categories, payees) and list_projects before drafting.`;

type Ctx = { token: ApiToken };

class ToolError extends Error {}

const wsParam = z.enum(["personal", "work"]).optional().describe('"personal" or "work". Omit for both.');
const dateParam = z.string().describe("YYYY-MM-DD");
const optDate = (what: string) => z.string().optional().describe(`${what} (YYYY-MM-DD)`);
const id = z.number().int().positive();

function ok(data: unknown) {
  return { content: [{ type: "text" as const, text: JSON.stringify(data, null, 1) }] };
}

function fail(message: string) {
  return { content: [{ type: "text" as const, text: message }], isError: true };
}

function checkDate(d: string | undefined, name: string) {
  if (d !== undefined && !isISODate(d)) throw new ToolError(`${name} must be a date as YYYY-MM-DD`);
  return d;
}

/** Workspace to read: the token's limit wins; asking for the other one is refused. */
function readWs({ token }: Ctx, requested?: Workspace): Workspace | undefined {
  if (token.workspace && requested && requested !== token.workspace) {
    throw new ToolError(`This connection is limited to the ${token.workspace} workspace`);
  }
  return token.workspace ?? requested;
}

function allowWs({ token }: Ctx, ws: Workspace) {
  if (token.workspace && token.workspace !== ws) throw new ToolError(`This connection is limited to the ${token.workspace} workspace`);
}

function amountFrom(v: string | number) {
  const s = typeof v === "number" ? v.toFixed(2) : v.trim().replace(/^[-+]/, "");
  const minor = parseAmount(s);
  if (minor === null || minor <= 0) throw new ToolError(`Invalid amount "${v}". Use a positive decimal like "45.90".`);
  return minor;
}

export function createMcpServer(token: ApiToken) {
  const ctx: Ctx = { token };
  const server = new McpServer({ name: "catastif", version: "1.0.0" }, { instructions: INSTRUCTIONS });

  /** Wraps a handler: known errors come back as tool errors Claude can read and fix. */
  const run =
    <A>(fn: (args: A) => Promise<unknown>) =>
    async (args: A) => {
      try {
        return ok(await fn(args));
      } catch (err) {
        if (err instanceof ToolError) return fail(err.message);
        if (err instanceof z.ZodError) return fail(err.issues.map((i) => `${i.path.join(".") || "input"}: ${i.message}`).join("; "));
        if (err instanceof Error && err.name === "ApiError") return fail(err.message);
        console.error("[mcp]", err);
        return fail("Something went wrong in Catastif.");
      }
    };

  const read = { readOnlyHint: true, openWorldHint: false } as const;
  const draft = { readOnlyHint: false, destructiveHint: false, idempotentHint: false, openWorldHint: false } as const;

  // ---------------- read ----------------
  if (hasScope(token, "read")) {
    server.registerTool(
      "get_overview",
      {
        title: "Today's overview",
        description: "Today's date, tasks due today or overdue, bills due in the next 7 days, money waiting to come in, safe-to-spend per workspace and the number of Inbox drafts waiting.",
        inputSchema: { workspace: wsParam },
        annotations: read,
      },
      run(async ({ workspace }: { workspace?: Workspace }) => {
        const ws = readWs(ctx, workspace);
        const t = today();
        const shown = ws ? [ws] : [...WORKSPACES];
        const [due, b, c, pending] = await Promise.all([
          tasks.listTasks({ workspace: ws, completed: false, dueTo: t, limit: 100 }),
          payments.bills({ workspace: ws }),
          payments.toCollect({ workspace: ws }),
          inbox.pendingCount(),
        ]);
        const safe = await Promise.all(
          shown.map(async (w) => ({
            workspace: w,
            per_currency: (await forecast.safeToSpend(w)).map((s) => ({
              currency: s.currency,
              balance: money(s.current, s.currency),
              bills_before_next_income: money(s.billsBeforeIncome, s.currency),
              safe_to_spend: money(s.safe, s.currency),
              next_income: s.nextIncome ? { title: s.nextIncome.title, date: s.nextIncome.date } : null,
            })),
          })),
        );
        return {
          today: t,
          tasks_due_today_or_overdue: due.map(task),
          bills_overdue: b.overdue.map(txRow),
          bills_due_next_7_days: b.dueSoon.map(txRow),
          money_to_collect: [...c.invoiced, ...c.expected].filter((r) => r.tx.date <= addDays(t, 7)).map(txRow),
          safe_to_spend: safe,
          inbox_drafts_waiting: pending,
        };
      }),
    );

    server.registerTool(
      "search_tasks",
      {
        title: "Search tasks",
        description: "List tasks with filters. Returns top-level tasks (subtasks are counted on their parent; open one with get_task).",
        inputSchema: {
          workspace: wsParam,
          status: z.enum(["open", "completed", "all"]).default("open"),
          project_id: id.optional(),
          due_before: optDate("Due on or before"),
          due_after: optDate("Due on or after"),
          query: z.string().max(200).optional().describe("Text to find in title or notes"),
          limit: z.number().int().min(1).max(200).default(50),
        },
        annotations: read,
      },
      run(async (a: { workspace?: Workspace; status: "open" | "completed" | "all"; project_id?: number; due_before?: string; due_after?: string; query?: string; limit: number }) => {
        const rows = await tasks.listTasks({
          workspace: readWs(ctx, a.workspace),
          projectId: a.project_id,
          completed: a.status === "all" ? undefined : a.status === "completed",
          dueTo: checkDate(a.due_before, "due_before"),
          dueFrom: checkDate(a.due_after, "due_after"),
          q: a.query,
          parentId: "top",
          limit: a.limit,
        });
        return { count: rows.length, tasks: rows.map(task) };
      }),
    );

    server.registerTool(
      "get_task",
      {
        title: "Get a task",
        description: "Full task: notes, subtasks, comments and history, and money linked to it.",
        inputSchema: { task_id: id },
        annotations: read,
      },
      run(async ({ task_id }: { task_id: number }) => {
        const d = await tasks.getTaskDetail(task_id);
        allowWs(ctx, d.task.workspace);
        return {
          ...task({ ...d, subtasks: d.subtasks.length }),
          notes: d.task.notes,
          estimate_minutes: d.task.estimateMinutes,
          subtasks: d.subtasks.map(task),
          comments: d.activity.filter((x) => x.kind === "comment").map((x) => ({ at: x.createdAt, body: x.body })),
          history: d.activity.filter((x) => x.kind !== "comment").map((x) => ({ at: x.createdAt, event: x.kind, data: x.data ?? undefined })),
          money: d.money.map(txRow),
        };
      }),
    );

    server.registerTool(
      "list_projects",
      {
        title: "List projects",
        description: "Projects with open/done task counts, overdue count, next due date and deadline.",
        inputSchema: { workspace: wsParam, include_archived: z.boolean().default(false) },
        annotations: read,
      },
      run(async ({ workspace, include_archived }: { workspace?: Workspace; include_archived: boolean }) => {
        const rows = await projects.listProjects({ workspace: readWs(ctx, workspace), includeArchived: include_archived });
        return rows.map(({ project: p, open, done, overdue, nextDue }) => ({
          id: p.id,
          name: p.name,
          workspace: p.workspace,
          status: p.status,
          deadline: p.dueDate,
          open_tasks: open,
          done_tasks: done,
          overdue_tasks: overdue,
          next_due: nextDue,
          description: p.description ?? undefined,
        }));
      }),
    );

    server.registerTool(
      "get_project",
      {
        title: "Get a project",
        description: "A project's sections with their open tasks, and the money linked to it (costs and income, paid and planned).",
        inputSchema: { project_id: id, include_completed: z.boolean().default(false) },
        annotations: read,
      },
      run(async ({ project_id, include_completed }: { project_id: number; include_completed: boolean }) => {
        const p = await projects.getProject(project_id);
        allowWs(ctx, p.workspace);
        const [rows, m] = await Promise.all([
          tasks.listTasks({ projectId: p.id, parentId: "top", completed: include_completed ? undefined : false }),
          projects.projectMoney(p.id),
        ]);
        const bySection = (sid: number | null) => rows.filter((r) => r.task.sectionId === sid).map(task);
        return {
          id: p.id,
          name: p.name,
          workspace: p.workspace,
          status: p.status,
          deadline: p.dueDate,
          description: p.description,
          sections: [
            ...(rows.some((r) => !r.task.sectionId) ? [{ id: null, name: "(no section)", tasks: bySection(null) }] : []),
            ...p.sections.map((s) => ({ id: s.id, name: s.name, tasks: bySection(s.id) })),
          ],
          money: m.map((x) => ({
            currency: x.currency,
            costs_paid: money(x.costPaid, x.currency),
            costs_planned: money(x.costPlanned, x.currency),
            income_received: money(x.incomeReceived, x.currency),
            income_planned: money(x.incomePlanned, x.currency),
          })),
        };
      }),
    );

    server.registerTool(
      "todo_before",
      {
        title: "To do before a date",
        description: "Everything still open up to a date: tasks due (including overdue) and bills / expected income due.",
        inputSchema: { date: dateParam, workspace: wsParam },
        annotations: read,
      },
      run(async ({ date, workspace }: { date: string; workspace?: Workspace }) => {
        const r = await tasks.todoBefore({ date: checkDate(date, "date")!, workspace: readWs(ctx, workspace) });
        return { date: r.date, tasks: r.tasks.map(task), money: r.money.map(txRow) };
      }),
    );

    server.registerTool(
      "get_balance",
      {
        title: "Balance and forecast",
        description:
          "Balance per account and per currency now and at a date (default today). Future dates include planned bills, expected income and recurring entries. Totals are never converted between currencies or added across workspaces.",
        inputSchema: { date: optDate("Balance at"), workspace: wsParam },
        annotations: read,
      },
      run(async ({ date, workspace }: { date?: string; workspace?: Workspace }) => {
        const ws = readWs(ctx, workspace);
        const at = checkDate(date, "date") ?? today();
        const shown = ws ? [ws] : [...WORKSPACES];
        return Promise.all(
          shown.map(async (w) => {
            const b = await forecast.balanceAt({ date: at, workspace: w });
            return {
              workspace: w,
              date: at,
              accounts: b.perAccount.map((p) => ({
                id: p.account.id,
                name: p.account.name,
                type: p.account.type,
                now: money(p.current, p.account.currency),
                at_date: money(p.atDate, p.account.currency),
              })),
              totals: b.totals.map((x) => ({ currency: x.currency, now: money(x.current, x.currency), at_date: money(x.atDate, x.currency) })),
            };
          }),
        );
      }),
    );

    server.registerTool(
      "list_bills",
      {
        title: "Bills and money to collect",
        description: "Open bills (money out) by urgency, and money in still expected or invoiced, with how long invoices have waited.",
        inputSchema: { workspace: wsParam },
        annotations: read,
      },
      run(async ({ workspace }: { workspace?: Workspace }) => {
        const ws = readWs(ctx, workspace);
        const [b, c] = await Promise.all([payments.bills({ workspace: ws }), payments.toCollect({ workspace: ws })]);
        return {
          bills: {
            overdue: b.overdue.map((r) => ({ ...txRow(r), days_late: -r.daysLeft })),
            due_next_7_days: b.dueSoon.map((r) => ({ ...txRow(r), days_left: r.daysLeft })),
            due_later: b.later.map(txRow),
          },
          to_collect: {
            invoiced: c.invoiced.map((r) => ({ ...txRow(r), waiting_days: r.waitingDays })),
            expected: c.expected.map((r) => ({ ...txRow(r), late: r.late })),
          },
        };
      }),
    );

    server.registerTool(
      "search_transactions",
      {
        title: "Search transactions",
        description: "Transactions with filters, newest first. Status: upcoming / invoiced (open) or paid / received (settled).",
        inputSchema: {
          workspace: wsParam,
          from: optDate("From date"),
          to: optDate("To date"),
          query: z.string().max(200).optional().describe("Text in title, notes or payee"),
          direction: z.enum(["in", "out"]).optional(),
          status: z.array(z.enum(["upcoming", "invoiced", "paid", "received"])).optional(),
          account_id: id.optional(),
          project_id: id.optional(),
          limit: z.number().int().min(1).max(500).default(100),
        },
        annotations: read,
      },
      run(async (a: { workspace?: Workspace; from?: string; to?: string; query?: string; direction?: "in" | "out"; status?: ("upcoming" | "invoiced" | "paid" | "received")[]; account_id?: number; project_id?: number; limit: number }) => {
        const rows = await transactions.listTransactions({
          workspace: readWs(ctx, a.workspace),
          from: checkDate(a.from, "from"),
          to: checkDate(a.to, "to"),
          q: a.query,
          direction: a.direction,
          status: a.status,
          accountId: a.account_id,
          projectId: a.project_id,
          limit: a.limit,
        });
        return { count: rows.length, transactions: rows.map(txRow) };
      }),
    );

    server.registerTool(
      "get_calendar",
      {
        title: "Calendar",
        description: "Tasks with due dates, bills, expected income, recurring entries and project deadlines between two dates (max ~13 months).",
        inputSchema: { from: dateParam, to: optDate("Until (default from + 30 days)"), workspace: wsParam },
        annotations: read,
      },
      run(async ({ from, to, workspace }: { from: string; to?: string; workspace?: Workspace }) => {
        checkDate(from, "from");
        const items = await calendar.calendarItems({ from, to: checkDate(to, "to") ?? addDays(from, 30), workspace: readWs(ctx, workspace) });
        return items.map((i) => ({
          date: i.date,
          time: i.time ?? undefined,
          kind: i.kind,
          title: i.title,
          workspace: i.workspace,
          id: i.id,
          done: i.done || undefined,
          overdue: i.overdue || undefined,
          amount: i.amount != null && i.currency ? money(i.amount, i.currency) : undefined,
        }));
      }),
    );

    server.registerTool(
      "list_money_setup",
      {
        title: "Accounts, categories and payees",
        description: "Ids you need for draft_transaction: accounts (with currency), income/expense categories and payees with their defaults.",
        inputSchema: { workspace: wsParam },
        annotations: read,
      },
      run(async ({ workspace }: { workspace?: Workspace }) => {
        const ws = readWs(ctx, workspace);
        const shown = ws ? [ws] : [...WORKSPACES];
        return Promise.all(
          shown.map(async (w) => {
            const [a, c, p] = await Promise.all([
              accounts.listAccounts({ workspace: w }),
              categories.listCategories({ workspace: w }),
              payees.listPayees({ workspace: w }),
            ]);
            return {
              workspace: w,
              accounts: a.map((x) => ({ id: x.id, name: x.name, type: x.type, currency: x.currency })),
              categories: c.map((x) => ({ id: x.id, name: x.name, kind: x.kind, parent_id: x.parentId ?? undefined })),
              payees: p.map((x) => ({
                id: x.id,
                name: x.name,
                usually: x.defaultDirection ?? undefined,
                default_category_id: x.defaultCategoryId ?? undefined,
                default_account_id: x.defaultAccountId ?? undefined,
              })),
            };
          }),
        );
      }),
    );

    server.registerTool(
      "list_inbox",
      {
        title: "Inbox drafts",
        description: "Drafts waiting for the user's approval (or recently approved/rejected ones).",
        inputSchema: { status: z.enum(["pending", "approved", "rejected"]).default("pending"), limit: z.number().int().min(1).max(100).default(30) },
        annotations: read,
      },
      run(async ({ status, limit }: { status: "pending" | "approved" | "rejected"; limit: number }) => {
        const items = await inbox.listInbox({ status: [status], limit });
        return items
          .filter((i) => {
            const w = (i.draft as { workspace?: Workspace } | null)?.workspace ?? i.workspace;
            return !token.workspace || !w || w === token.workspace;
          })
          .map((i) => ({
            id: i.id,
            created_at: i.createdAt,
            source: i.source,
            text: i.rawText,
            kind: i.kind,
            draft: i.draft,
            status: i.status,
            result: i.resultId ? { type: i.resultType, id: i.resultId } : undefined,
          }));
      }),
    );
  }

  // ---------------- drafts (Inbox) ----------------
  if (hasScope(token, "inbox")) {
    server.registerTool(
      "draft_task",
      {
        title: "Draft a task",
        description: "Creates a task draft in the Inbox for the user to approve. Use project_id from list_projects (it decides the workspace).",
        inputSchema: {
          workspace: z.enum(["personal", "work"]).describe("Ignored when project_id is given"),
          title: z.string().min(1).max(200),
          notes: z.string().max(5000).optional(),
          due_date: optDate("Due date"),
          due_time: z.string().regex(/^\d{2}:\d{2}$/).optional().describe("HH:MM, 24h"),
          priority: z.enum(["none", "low", "medium", "high"]).default("none"),
          project_id: id.optional(),
          tags: z.array(z.string().max(50)).max(10).default([]),
          source_text: z.string().max(2000).optional().describe("What the user said, shown next to the draft"),
        },
        annotations: draft,
      },
      run(async (a: { workspace: Workspace; title: string; notes?: string; due_date?: string; due_time?: string; priority: "none" | "low" | "medium" | "high"; project_id?: number; tags: string[]; source_text?: string }) => {
        let ws = a.workspace;
        if (a.project_id) ws = (await projects.getProject(a.project_id)).workspace;
        allowWs(ctx, ws);
        const item = await inbox.createDraft({
          source: "chat",
          kind: "task",
          extractor: "claude (mcp)",
          rawText: a.source_text ?? a.title,
          draft: {
            workspace: ws,
            title: a.title,
            notes: a.notes ?? null,
            dueDate: checkDate(a.due_date, "due_date") ?? null,
            dueTime: a.due_time ?? null,
            priority: a.priority,
            projectId: a.project_id ?? null,
            tags: a.tags,
          },
        });
        return { inbox_item_id: item.id, status: "pending", note: "Draft saved to the Catastif Inbox. It becomes a real task when the user approves it." };
      }),
    );

    server.registerTool(
      "draft_transaction",
      {
        title: "Draft a transaction",
        description:
          'Creates a money draft in the Inbox for the user to approve: an expense, a bill to pay (status "upcoming" + due_date), income received, or income expected. The account decides workspace and currency; get ids from list_money_setup.',
        inputSchema: {
          account_id: id,
          title: z.string().min(1).max(200).describe('What it is, e.g. "Electricity September"'),
          direction: z.enum(["in", "out"]),
          amount: z.union([z.string(), z.number()]).describe('Decimal in the account currency, e.g. "230" or "45.90"'),
          status: z.enum(["upcoming", "invoiced", "paid", "received"]).optional().describe("Default: settled if the date is today or earlier, otherwise upcoming"),
          date: optDate("When the money moved or is expected to (default today)"),
          due_date: optDate("For bills: due date"),
          category_id: id.optional(),
          payee_id: id.optional(),
          notes: z.string().max(2000).optional(),
          source_text: z.string().max(2000).optional().describe("What the user said, shown next to the draft"),
        },
        annotations: draft,
      },
      run(async (a: { account_id: number; title: string; direction: "in" | "out"; amount: string | number; status?: "upcoming" | "invoiced" | "paid" | "received"; date?: string; due_date?: string; category_id?: number; payee_id?: number; notes?: string; source_text?: string }) => {
        const acc = await accounts.getAccount(a.account_id);
        allowWs(ctx, acc.workspace);
        const date = checkDate(a.date, "date") ?? today();
        const status = a.status ?? (date > today() ? "upcoming" : a.direction === "in" ? "received" : "paid");
        const valid = a.direction === "out" ? ["upcoming", "paid"] : ["upcoming", "invoiced", "received"];
        if (!valid.includes(status)) throw new ToolError(`Status "${status}" doesn't fit money ${a.direction}. Use one of: ${valid.join(", ")}.`);
        const item = await inbox.createDraft({
          source: "chat",
          kind: "transaction",
          extractor: "claude (mcp)",
          rawText: a.source_text ?? a.title,
          draft: {
            workspace: acc.workspace,
            title: a.title,
            direction: a.direction,
            amount: amountFrom(a.amount),
            accountId: acc.id,
            status,
            date,
            dueDate: checkDate(a.due_date, "due_date") ?? null,
            categoryId: a.category_id ?? null,
            payeeId: a.payee_id ?? null,
            notes: a.notes ?? null,
          },
        });
        return { inbox_item_id: item.id, status: "pending", currency: acc.currency, note: "Draft saved to the Catastif Inbox. It becomes a real transaction when the user approves it." };
      }),
    );

    server.registerTool(
      "capture_to_inbox",
      {
        title: "Capture free text",
        description: "Sends free text to the Inbox; Catastif drafts it as a task or transaction itself. Prefer draft_task / draft_transaction when you already know the details.",
        inputSchema: { text: z.string().min(1).max(5000), workspace: wsParam },
        annotations: draft,
      },
      run(async ({ text, workspace }: { text: string; workspace?: Workspace }) => {
        const ws = readWs(ctx, workspace);
        const item = await inbox.capture({ text, source: "chat", workspace: ws ?? null });
        return { inbox_item_id: item.id, kind: item.kind, draft: item.draft, status: "pending" };
      }),
    );
  }

  // ---------------- direct changes (only with "write") ----------------
  if (hasScope(token, "write")) {
    const change = { readOnlyHint: false, destructiveHint: false, idempotentHint: true, openWorldHint: false } as const;

    server.registerTool(
      "complete_task",
      {
        title: "Complete a task",
        description: "Marks a task done (or not done with completed=false).",
        inputSchema: { task_id: id, completed: z.boolean().default(true) },
        annotations: change,
      },
      run(async ({ task_id, completed }: { task_id: number; completed: boolean }) => {
        allowWs(ctx, (await tasks.getTaskRow(task_id)).workspace);
        const t = await tasks.setCompleted({ id: task_id, completed });
        return { id: t.id, title: t.title, completed: t.completed };
      }),
    );

    server.registerTool(
      "update_task",
      {
        title: "Update a task",
        description: "Changes a task's due date/time, priority, title or notes. Pass null to clear a date.",
        inputSchema: {
          task_id: id,
          title: z.string().min(1).max(200).optional(),
          notes: z.string().max(20000).nullable().optional(),
          due_date: z.string().nullable().optional().describe("YYYY-MM-DD or null"),
          due_time: z.string().regex(/^\d{2}:\d{2}$/).nullable().optional(),
          priority: z.enum(["none", "low", "medium", "high"]).optional(),
        },
        annotations: change,
      },
      run(async (a: { task_id: number; title?: string; notes?: string | null; due_date?: string | null; due_time?: string | null; priority?: "none" | "low" | "medium" | "high" }) => {
        allowWs(ctx, (await tasks.getTaskRow(a.task_id)).workspace);
        if (a.due_date) checkDate(a.due_date, "due_date");
        const t = await tasks.updateTask({ id: a.task_id, title: a.title, notes: a.notes, dueDate: a.due_date, dueTime: a.due_time, priority: a.priority });
        return { id: t.id, title: t.title, due_date: t.dueDate, due_time: t.dueTime?.slice(0, 5) ?? null, priority: t.priority };
      }),
    );

    server.registerTool(
      "comment_on_task",
      {
        title: "Comment on a task",
        description: "Adds a comment to a task's activity.",
        inputSchema: { task_id: id, body: z.string().min(1).max(5000) },
        annotations: { ...change, idempotentHint: false },
      },
      run(async ({ task_id, body }: { task_id: number; body: string }) => {
        allowWs(ctx, (await tasks.getTaskRow(task_id)).workspace);
        const c = await tasks.addComment({ taskId: task_id, body });
        return { comment_id: c.id };
      }),
    );

    server.registerTool(
      "settle_transaction",
      {
        title: "Mark paid / received",
        description: "Marks an open bill as paid or expected income as received (on a date, default today).",
        inputSchema: { transaction_id: id, date: optDate("Paid/received on") },
        annotations: change,
      },
      run(async ({ transaction_id, date }: { transaction_id: number; date?: string }) => {
        allowWs(ctx, (await transactions.getTransaction(transaction_id)).workspace);
        return tx(await transactions.settleTransaction({ id: transaction_id, date: checkDate(date, "date") }));
      }),
    );
  }

  return server;
}
