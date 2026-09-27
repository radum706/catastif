import { ActionForm, ConfirmButton, SubmitButton } from "@/components/forms";
import { Badge, Field, PageHeader, Section } from "@/components/ui";
import {
  createCategoryAction,
  deleteCategoryAction,
  renameCategoryAction,
  seedCategoriesAction,
  toggleCategoryAction,
} from "@/server/actions/money";
import { categories } from "@/server/api";
import type { Category } from "@/server/db/schema";
import { getWorkspace } from "@/server/workspace";
import { fmt, t } from "@/i18n";

export const metadata = { title: t.settings.categories };

function CategoryItem({ c, child }: { c: Category; child?: boolean }) {
  return (
    <li className={`flex flex-wrap items-center gap-2 px-4 py-2 ${child ? "pl-10" : ""}`}>
      <ActionForm action={renameCategoryAction} className="flex flex-1 items-center gap-2">
        <input type="hidden" name="id" value={c.id} />
        <input name="name" defaultValue={c.name} className="input max-w-64 py-1" aria-label={t.common.name} />
        <SubmitButton className="btn btn-sm">{t.common.save}</SubmitButton>
        {c.archived && <Badge>{t.common.archived}</Badge>}
      </ActionForm>
      <form action={toggleCategoryAction}>
        <input type="hidden" name="id" value={c.id} />
        <input type="hidden" name="archived" value={String(!c.archived)} />
        <SubmitButton className="btn btn-sm">{c.archived ? t.common.unarchive : t.common.archive}</SubmitButton>
      </form>
      <form action={deleteCategoryAction}>
        <input type="hidden" name="id" value={c.id} />
        <ConfirmButton message={t.common.confirmDelete}>{t.common.delete}</ConfirmButton>
      </form>
    </li>
  );
}

export default async function CategoriesPage() {
  const ws = await getWorkspace();
  const all = await categories.listCategories({ workspace: ws, includeArchived: true });
  const roots = all.filter((c) => !c.parentId);
  const children = (id: number) => all.filter((c) => c.parentId === id);

  return (
    <>
      <PageHeader
        title={t.settings.categories}
        intro={fmt(t.settings.inWorkspace, { ws: t.enums.workspace[ws] })}
        actions={
          <form action={seedCategoriesAction}>
            <SubmitButton className="btn">{t.category.seed}</SubmitButton>
          </form>
        }
      />
      <ActionForm action={createCategoryAction} resetOnSuccess className="card mb-6 grid gap-3 p-4 sm:grid-cols-[2fr_1fr_1fr_auto] sm:items-end">
        <Field label={t.common.name}>
          <input name="name" required className="input" />
        </Field>
        <Field label={t.category.kind}>
          <select name="kind" className="input" defaultValue="expense">
            <option value="expense">{t.enums.categoryKind.expense}</option>
            <option value="income">{t.enums.categoryKind.income}</option>
          </select>
        </Field>
        <Field label={`${t.category.parent} (${t.common.optional})`}>
          <select name="parentId" className="input" defaultValue="">
            <option value="">{t.common.none}</option>
            {roots.map((c) => (
              <option key={c.id} value={c.id}>{c.name} ({t.enums.categoryKind[c.kind]})</option>
            ))}
          </select>
        </Field>
        <SubmitButton>{t.category.add}</SubmitButton>
      </ActionForm>

      {(["expense", "income"] as const).map((kind) => (
        <Section key={kind} title={t.enums.categoryKind[kind]}>
          <ul className="card divide-y divide-border">
            {roots
              .filter((c) => c.kind === kind)
              .map((c) => [
                <CategoryItem key={c.id} c={c} />,
                ...children(c.id).map((ch) => <CategoryItem key={ch.id} c={ch} child />),
              ])}
          </ul>
        </Section>
      ))}
    </>
  );
}
