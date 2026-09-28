import { accounts, categories, payees } from "@/server/api";
import { handler, qp, readWorkspace } from "@/server/rest";

/** Accounts plus the categories and payees you need to create transactions. */
export const GET = handler("read", async ({ token, url }) => {
  const workspace = readWorkspace(token, qp(url, "workspace"));
  const [accs, cats, pays] = await Promise.all([
    accounts.listAccounts({ workspace }),
    categories.listCategories({ workspace }),
    payees.listPayees({ workspace }),
  ]);
  return { accounts: accs, categories: cats, payees: pays };
});
