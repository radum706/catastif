import Link from "next/link";
import { TransactionForm } from "@/components/transaction-form";
import { Empty, PageHeader } from "@/components/ui";
import { today } from "@/lib/dates";
import { createTransactionAction } from "@/server/actions/money";
import { tasks } from "@/server/api";
import { formOptions, numParam, param, safePath } from "@/server/form-data";
import { getWorkspace } from "@/server/workspace";
import { t } from "@/i18n";

export const metadata = { title: t.tx.newTitle };

export default async function NewTransactionPage({ searchParams }: PageProps<"/money/transactions/new">) {
  const sp = await searchParams;
  const taskId = numParam(sp, "taskId");
  const task = taskId ? await tasks.getTaskRow(taskId).catch(() => null) : null;
  // A cost for a task is booked in the task's workspace.
  const ws = task?.workspace ?? (await getWorkspace());
  const opts = await formOptions(ws);
  const direction = param(sp, "direction") === "in" ? "in" : "out";
  const status = param(sp, "status") === "upcoming" ? "upcoming" : direction === "in" ? "received" : "paid";
  const returnTo = safePath(param(sp, "returnTo"), "/money/transactions");

  return (
    <>
      <PageHeader title={t.tx.newTitle} actions={<Link href="/money/transfers/new" className="btn">⇄ {t.tx.newTransfer}</Link>} />
      {opts.accounts.length === 0 ? (
        <Empty>
          {t.home.setupHint} <Link href="/settings/accounts/new" className="text-accent underline">{t.home.addAccount}</Link>
        </Empty>
      ) : (
        <TransactionForm
          action={createTransactionAction}
          initial={{
            title: task?.title ?? "",
            direction,
            status,
            date: task?.dueDate && task.dueDate > today() ? task.dueDate : today(),
            projectId: task?.projectId ?? numParam(sp, "projectId") ?? null,
            taskId: task?.id ?? null,
          }}
          taskTitle={task?.title}
          returnTo={returnTo}
          {...opts}
        />
      )}
    </>
  );
}
