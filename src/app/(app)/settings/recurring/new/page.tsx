import { RuleForm } from "@/components/rule-form";
import { PageHeader } from "@/components/ui";
import { formOptions } from "@/server/form-data";
import { getWorkspace } from "@/server/workspace";
import { t } from "@/i18n";

export const metadata = { title: t.rule.newTitle };

export default async function NewRulePage() {
  const opts = await formOptions(await getWorkspace());
  return (
    <>
      <PageHeader title={t.rule.newTitle} />
      <RuleForm {...opts} />
    </>
  );
}
