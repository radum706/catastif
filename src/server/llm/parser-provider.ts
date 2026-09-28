import { parseQuickAdd } from "@/lib/quick-add";
import { parseTaskLine } from "@/lib/task-parse";
import type { ExtractContext, Extraction, LlmProvider } from "./types";

const MONEY_HINT = /(^|\s)[+-]\s?\d|\d\s?(lei|ron|eur|€|euro)\b|\b(paid|platit|plătit|factura|factură|invoice|bill|salary|salariu)\b/i;

/** No-AI fallback: the same one-line parsers the quick-add boxes use. */
export class ParserProvider implements LlmProvider {
  readonly name = "parser";

  async extract(text: string, ctx: ExtractContext): Promise<Extraction> {
    const workspace = ctx.workspaceHint ?? "personal";
    const w = ctx.workspaces[workspace];
    const kind = ctx.kind ?? (MONEY_HINT.test(text) ? "transaction" : "task");
    if (kind === "transaction") {
      const p = parseQuickAdd(text, { today: ctx.today, payees: w.payees, categories: w.categories });
      return {
        kind,
        draft: {
          workspace,
          title: p.title,
          direction: p.direction,
          amount: p.amount,
          accountId: p.accountId ?? (w.accounts.length === 1 ? w.accounts[0].id : null),
          status: p.status,
          date: p.date,
          dueDate: p.dueDate,
          categoryId: p.categoryId,
          payeeId: p.payeeId,
          notes: null,
        },
      };
    }
    const t = parseTaskLine(text, ctx.today);
    if (!t.title) return { kind: "unknown", draft: null };
    return {
      kind: "task",
      draft: { workspace, title: t.title, notes: null, dueDate: t.dueDate, dueTime: t.dueTime, priority: t.priority, projectId: null, tags: t.tags },
    };
  }
}
