import { transactions } from "@/server/api";
import { assertWorkspace, body, handler, qint, qp, readWorkspace } from "@/server/rest";
import { accountWorkspace } from "@/server/rest-targets";

/** GET /api/v1/transactions?workspace=&from=&to=&accountId=&direction=&status=&q=&limit= */
export const GET = handler("read", async ({ token, url }) => {
  const status = qp(url, "status");
  const rows = await transactions.listTransactions({
    workspace: readWorkspace(token, qp(url, "workspace")),
    from: qp(url, "from"),
    to: qp(url, "to"),
    accountId: qint(url, "accountId"),
    projectId: qint(url, "projectId"),
    direction: qp(url, "direction") as "in" | "out" | undefined,
    status: status ? (status.split(",") as ("upcoming" | "invoiced" | "paid" | "received")[]) : undefined,
    q: qp(url, "q"),
    limit: qint(url, "limit") ?? 200,
  });
  return { transactions: rows.map(({ tx, ...names }) => ({ ...tx, ...names })) };
});

/**
 * POST /api/v1/transactions
 *   { title, direction: "in"|"out", amount (minor units, e.g. 4590 = 45.90), accountId,
 *     status?, date?, dueDate?, categoryId?, payeeId?, projectId?, taskId?, notes? }
 * or quick-add: { "text": "-45,90 Lidl food", "workspace": "personal", "accountId"?: 3 }
 */
export const POST = handler("write", async ({ token, req }) => {
  const b = await body(req);
  if (typeof b.text === "string") {
    const ws = b.workspace ?? token.workspace;
    assertWorkspace(token, ws as "personal" | "work");
    const tx = await transactions.quickAdd({ text: b.text, workspace: ws as "personal" | "work", accountId: b.accountId as number | undefined });
    return Response.json({ transaction: tx }, { status: 201 });
  }
  assertWorkspace(token, await accountWorkspace(b.accountId));
  const tx = await transactions.createTransaction(b as Parameters<typeof transactions.createTransaction>[0]);
  return Response.json({ transaction: tx }, { status: 201 });
});
