import Link from "next/link";
import { notFound } from "next/navigation";
import { ConfirmButton } from "@/components/forms";
import { RuleForm } from "@/components/rule-form";
import { PageHeader } from "@/components/ui";
import { deleteRuleAction } from "@/server/actions/money";
import { recurring } from "@/server/api";
import { formOptions } from "@/server/form-data";
import { t } from "@/i18n";

export const metadata = { title: t.rule.editTitle };

export default async function EditRulePage({ params }: PageProps<"/settings/recurring/[id]">) {
  const { id } = await params;
  const rule = await recurring.getRule(Number(id)).catch(() => notFound());
  const opts = await formOptions(rule.workspace);
  return (
    <>
      <PageHeader title={rule.title} actions={<Link href="/money/transactions?status=upcoming" className="btn">{t.nav.transactions} →</Link>} />
      <RuleForm rule={rule} {...opts} />
      <form action={deleteRuleAction} className="mt-4 flex justify-end">
        <input type="hidden" name="id" value={rule.id} />
        <ConfirmButton message={t.common.confirmDelete} className="btn btn-danger">{t.common.delete}</ConfirmButton>
      </form>
    </>
  );
}
