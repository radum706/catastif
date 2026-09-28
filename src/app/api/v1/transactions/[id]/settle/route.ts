import { transactions } from "@/server/api";
import { assertWorkspace, body, handler } from "@/server/rest";

/** POST { date?: "YYYY-MM-DD", amount?: minor units } — bill paid / income received. */
export const POST = handler<{ id: string }>("write", async ({ token, params, req }) => {
  const tx = await transactions.getTransaction(Number(params.id));
  assertWorkspace(token, tx.workspace);
  const b = await body(req);
  return { transaction: await transactions.settleTransaction({ id: tx.id, ...(b as object) }) };
});
