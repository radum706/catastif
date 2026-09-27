import { transactions } from "@/server/api";
import { assertWorkspace, body, handler } from "@/server/rest";
import { accountWorkspace } from "@/server/rest-targets";

type P = { id: string };

export const GET = handler<P>("read", async ({ token, params }) => {
  const tx = await transactions.getTransaction(Number(params.id));
  assertWorkspace(token, tx.workspace);
  return { transaction: tx };
});

export const PATCH = handler<P>("write", async ({ token, params, req }) => {
  const tx = await transactions.getTransaction(Number(params.id));
  assertWorkspace(token, tx.workspace);
  const b = await body(req);
  if (b.accountId !== undefined) assertWorkspace(token, await accountWorkspace(b.accountId));
  return { transaction: await transactions.updateTransaction({ ...(b as object), id: tx.id } as Parameters<typeof transactions.updateTransaction>[0]) };
});

export const DELETE = handler<P>("write", async ({ token, params }) => {
  const tx = await transactions.getTransaction(Number(params.id));
  assertWorkspace(token, tx.workspace);
  await transactions.deleteTransaction(tx.id);
  return { ok: true };
});
