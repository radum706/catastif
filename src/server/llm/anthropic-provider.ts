import Anthropic from "@anthropic-ai/sdk";
import { zodOutputFormat } from "@anthropic-ai/sdk/helpers/zod";
import { z } from "zod";
import { isISODate } from "@/lib/dates";
import { parseAmount } from "@/lib/money";
import { redact } from "./redact";
import type { ExtractContext, Extraction, LlmProvider, WorkspaceContext } from "./types";

/** What the model fills in. Ids must come from the lists we send; we re-check them after. */
const Output = z.object({
  kind: z.enum(["task", "transaction", "unknown"]),
  workspace: z.enum(["personal", "work"]),
  task: z
    .object({
      title: z.string(),
      notes: z.string().nullable(),
      dueDate: z.string().nullable(),
      dueTime: z.string().nullable(),
      priority: z.enum(["none", "low", "medium", "high"]),
      projectId: z.number().int().nullable(),
      tags: z.array(z.string()),
    })
    .nullable(),
  transaction: z
    .object({
      title: z.string(),
      direction: z.enum(["in", "out"]),
      amount: z.string().nullable(),
      status: z.enum(["upcoming", "invoiced", "paid", "received"]),
      date: z.string().nullable(),
      dueDate: z.string().nullable(),
      accountId: z.number().int().nullable(),
      categoryId: z.number().int().nullable(),
      payeeId: z.number().int().nullable(),
      notes: z.string().nullable(),
    })
    .nullable(),
});

const SYSTEM = `You turn a short note from the user's personal organiser into a draft task or a draft money transaction. The user approves every draft, so fill in what the note says and leave unknowns null rather than guessing.

The organiser has two separate workspaces: "personal" and "work" (clients, jobs, the business). Pick the workspace the note belongs to; if the sender gave a hint, use it unless the note clearly says otherwise.

Decide the kind:
- "transaction": money spent, received, owed or expected (a bill, an invoice, a salary, a purchase).
- "task": something to do.
- "unknown": neither, or too vague.
Fill only the matching object and set the other to null.

Tasks: short imperative title in the note's language; dueDate as YYYY-MM-DD resolved against today's date; dueTime as HH:MM (24h) only if a time is stated; priority "high" only if the note says urgent/important; projectId only if the note clearly refers to a listed project; tags only if the note names them.

Transactions: title names what it is ("Electricity September", "Lidl groceries"); direction "out" for money leaving, "in" for money received or expected; amount as a plain decimal string without currency ("45.90"); status "paid"/"received" if it already happened, "upcoming" if it is still to pay or to receive, "invoiced" only for money in that has been invoiced; date is when the money moved or is expected to move; dueDate only for bills with a due date. Choose accountId, categoryId and payeeId only from the lists for the chosen workspace; the account's currency should match the note's currency when one is given.`;

function list(ws: WorkspaceContext) {
  return JSON.stringify({
    accounts: ws.accounts.map((a) => ({ id: a.id, name: a.name, currency: a.currency })),
    categories: ws.categories.map((c) => ({ id: c.id, name: c.name, kind: c.kind })),
    payees: ws.payees.map((p) => ({ id: p.id, name: p.name })),
    projects: ws.projects.map((p) => ({ id: p.id, name: p.name })),
  });
}

const known = (id: number | null, rows: { id: number }[]) => (id !== null && rows.some((r) => r.id === id) ? id : null);
const date = (d: string | null) => (d && isISODate(d) ? d : null);

export class AnthropicProvider implements LlmProvider {
  readonly name: string;
  private client: Anthropic;

  constructor(
    private model: string,
    apiKey?: string,
  ) {
    this.name = `anthropic:${model}`;
    this.client = new Anthropic({ apiKey, timeout: 30_000, maxRetries: 1 });
  }

  async extract(text: string, ctx: ExtractContext): Promise<Extraction> {
    const note = redact(text);
    const response = await this.client.messages.parse({
      model: this.model,
      max_tokens: 2048,
      system: SYSTEM,
      messages: [
        {
          role: "user",
          content: [
            `Today: ${ctx.today} (${ctx.timeZone})`,
            `Workspace hint: ${ctx.workspaceHint ?? "none"}`,
            ctx.kind ? `The user wants this as a ${ctx.kind}.` : "",
            `Personal workspace: ${list(ctx.workspaces.personal)}`,
            `Work workspace: ${list(ctx.workspaces.work)}`,
            `Note:\n<note>\n${note}\n</note>`,
          ]
            .filter(Boolean)
            .join("\n\n"),
        },
      ],
      output_config: { format: zodOutputFormat(Output) },
    });

    if (response.stop_reason === "refusal") throw new Error("The model declined this note");
    if (response.stop_reason === "max_tokens") throw new Error("The model's answer was cut off");
    const out = response.parsed_output;
    if (!out) throw new Error("The model returned no usable draft");

    const kind = ctx.kind ?? out.kind;
    const w = ctx.workspaces[out.workspace];
    if (kind === "task" && out.task) {
      const t = out.task;
      return {
        kind,
        draft: {
          workspace: out.workspace,
          title: t.title.trim().slice(0, 200) || text.slice(0, 80),
          notes: t.notes,
          dueDate: date(t.dueDate),
          dueTime: t.dueTime && /^\d{2}:\d{2}$/.test(t.dueTime) ? t.dueTime : null,
          priority: t.priority,
          projectId: known(t.projectId, w.projects),
          tags: t.tags.slice(0, 20),
        },
      };
    }
    if (kind === "transaction" && out.transaction) {
      const x = out.transaction;
      const amount = x.amount ? parseAmount(x.amount.replace(/^-/, "")) : null;
      const status =
        x.direction === "out"
          ? x.status === "paid" || x.status === "received" ? "paid" : "upcoming"
          : x.status === "paid" ? "received" : x.status;
      return {
        kind,
        draft: {
          workspace: out.workspace,
          title: x.title.trim().slice(0, 200) || text.slice(0, 80),
          direction: x.direction,
          amount: amount && amount > 0 ? amount : null,
          accountId: known(x.accountId, w.accounts) ?? (w.accounts.length === 1 ? w.accounts[0].id : null),
          status,
          date: date(x.date) ?? ctx.today,
          dueDate: x.direction === "out" ? date(x.dueDate) : null,
          categoryId: known(x.categoryId, w.categories),
          payeeId: known(x.payeeId, w.payees),
          notes: x.notes,
        },
      };
    }
    return { kind: "unknown", draft: null };
  }
}
