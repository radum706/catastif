import "server-only";
import { accounts, categories, payees, projects } from "@/server/api";
import type { Workspace } from "@/server/db/schema";

/** Option lists every money form needs, for one workspace. */
export async function formOptions(workspace: Workspace) {
  const [accs, cats, pays, projs] = await Promise.all([
    accounts.listAccounts({ workspace }),
    categories.listCategories({ workspace }),
    payees.listPayees({ workspace }),
    projects.listProjects({ workspace }),
  ]);
  return {
    accounts: accs.map((a) => ({ id: a.id, name: a.name, currency: a.currency })),
    categories: cats.map((c) => ({ id: c.id, name: c.name, kind: c.kind, parentId: c.parentId })),
    payees: pays.map((p) => ({
      id: p.id,
      name: p.name,
      defaultDirection: p.defaultDirection,
      defaultCategoryId: p.defaultCategoryId,
      defaultAccountId: p.defaultAccountId,
    })),
    projects: projs.map((p) => ({ id: p.project.id, name: p.project.name })),
  };
}

export type FormOptions = Awaited<ReturnType<typeof formOptions>>;

type SP = Record<string, string | string[] | undefined>;
export const param = (sp: SP, k: string) => {
  const v = sp[k];
  return (Array.isArray(v) ? v[0] : v) ?? undefined;
};
export const safePath = (v: string | undefined, fallback: string) =>
  v && v.startsWith("/") && !v.startsWith("//") ? v : fallback;
export const numParam = (sp: SP, k: string) => {
  const v = param(sp, k);
  return v && /^\d+$/.test(v) ? Number(v) : undefined;
};
