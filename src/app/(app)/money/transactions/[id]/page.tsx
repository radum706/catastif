import { notFound } from "next/navigation";
import { ConfirmButton } from "@/components/forms";
import { TransactionForm } from "@/components/transaction-form";
import { TxActions } from "@/components/tx-row";
import { Badge, PageHeader, StatusBadge, WorkspaceBadge } from "@/components/ui";
import { formatDate } from "@/lib/dates";
import { deleteTransactionAction, updateTransactionAction } from "@/server/actions/money";
import { tasks, transactions } from "@/server/api";
import { ApiError } from "@/server/api/errors";
import { formOptions, param, safePath } from "@/server/form-data";
import { t } from "@/i18n";

export const metadata = { title: t.tx.editTitle };

export default async function EditTransactionPage({ params, searchParams }: PageProps<"/money/transactions/[id]">) {
  const [{ id }, sp] = await Promise.all([params, searchParams]);
  const tx = await transactions.getTransaction(Number(id)).catch((e) => {
    if (e instanceof ApiError || Number.isNaN(Number(id))) notFound();
    throw e;
  });
  const [opts, task] = await Promise.all([
    formOptions(tx.workspace),
    tx.taskId ? tasks.getTaskRow(tx.taskId).catch(() => null) : null,
  ]);
  const returnTo = safePath(param(sp, "returnTo"), "/money/transactions");

  return (
    <>
      <PageHeader
        title={tx.title}
        intro={[
          tx.settledAt && `${t.tx.settledAt}: ${formatDate(tx.settledAt)}`,
          tx.invoicedAt && `${t.tx.invoicedAt}: ${formatDate(tx.invoicedAt)}`,
        ]
          .filter(Boolean)
          .join(" · ")}
        actions={
          <div className="flex items-center gap-2">
            <StatusBadge status={tx.status} />
            {tx.transferId && <Badge>⇄ {t.tx.transfer}</Badge>}
            {tx.recurringRuleId && <Badge>↻ {t.tx.fromRule}</Badge>}
            <WorkspaceBadge ws={tx.workspace} />
            <TxActions tx={tx} />
          </div>
        }
      />
      <TransactionForm
        action={updateTransactionAction}
        initial={tx}
        returnTo={returnTo}
        lockDirection={!!tx.transferId}
        taskTitle={task?.title}
        {...opts}
      />
      <form action={deleteTransactionAction} className="mt-4 flex justify-end">
        <input type="hidden" name="id" value={tx.id} />
        <input type="hidden" name="returnTo" value={returnTo} />
        <ConfirmButton message={t.common.confirmDelete} className="btn btn-danger">
          {t.common.delete}
        </ConfirmButton>
      </form>
    </>
  );
}
