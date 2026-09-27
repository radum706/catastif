import "server-only";
import { accounts, categories, payees } from "@/server/api";

/** Option lists every money form needs. */
export async function formOptions() {
  const [accs, cats, pays] = await Promise.all([
    accounts.listAccounts(),
    categories.listCategories(),
    payees.listPayees(),
  ]);
  return {
    accounts: accs.map((a) => ({ id: a.id, name: a.name, currency: a.currency, context: a.context })),
    categories: cats.map((c) => ({ id: c.id, name: c.name, kind: c.kind, parentId: c.parentId })),
    payees: pays.map((p) => ({
      id: p.id,
      name: p.name,
      defaultDirection: p.defaultDirection,
      defaultCategoryId: p.defaultCategoryId,
      defaultAccountId: p.defaultAccountId,
      defaultContext: p.defaultContext,
    })),
  };
}

type SP = Record<string, string | string[] | undefined>;
export const param = (sp: SP, k: string) => {
  const v = sp[k];
  return (Array.isArray(v) ? v[0] : v) ?? undefined;
};
export const safePath = (v: string | undefined, fallback: string) =>
  v && v.startsWith("/") && !v.startsWith("//") ? v : fallback;
