import Link from "next/link";
import type { ReactNode } from "react";
import { ConfirmButton, SubmitButton } from "@/components/forms";
import { Money, StatusBadge } from "@/components/ui";
import { formatShortDate } from "@/lib/dates";
import { deleteTransactionAction, invoiceAction, reopenAction, settleAction } from "@/server/actions/money";
import type { TransactionRow } from "@/server/api/transactions";
import { t } from "@/i18n";

function RowButton({ action, id, children, primary }: { action: (fd: FormData) => Promise<void>; id: number; children: ReactNode; primary?: boolean }) {
  return (
    <form action={action}>
      <input type="hidden" name="id" value={id} />
      <SubmitButton className={`btn btn-sm ${primary ? "btn-primary" : ""}`}>{children}</SubmitButton>
    </form>
  );
}

/** The quick lifecycle buttons for a transaction. */
export function TxActions({ tx, showDelete }: { tx: TransactionRow["tx"]; showDelete?: boolean }) {
  const settled = tx.status === "paid" || tx.status === "received";
  return (
    <div className="flex flex-wrap items-center gap-1.5">
      {!settled && tx.direction === "out" && (
        <RowButton action={settleAction} id={tx.id} primary>
          ✓ {t.tx.markPaid}
        </RowButton>
      )}
      {!settled && tx.direction === "in" && tx.status === "upcoming" && !tx.transferId && (
        <RowButton action={invoiceAction} id={tx.id}>
          {t.tx.markInvoiced}
        </RowButton>
      )}
      {!settled && tx.direction === "in" && (
        <RowButton action={settleAction} id={tx.id} primary>
          ✓ {t.tx.markReceived}
        </RowButton>
      )}
      {settled && (
        <RowButton action={reopenAction} id={tx.id}>
          ↺ {t.tx.reopen}
        </RowButton>
      )}
      {showDelete && (
        <form action={deleteTransactionAction}>
          <input type="hidden" name="id" value={tx.id} />
          <ConfirmButton message={t.common.confirmDelete}>{t.common.delete}</ConfirmButton>
        </form>
      )}
    </div>
  );
}

export function TxRow({
  row,
  meta,
  actions = true,
  showStatus = true,
}: {
  row: TransactionRow;
  meta?: ReactNode;
  actions?: boolean;
  showStatus?: boolean;
}) {
  const { tx } = row;
  const category = row.parentCategoryName ? `${row.parentCategoryName} › ${row.categoryName}` : row.categoryName;
  return (
    <li className="flex flex-col gap-2 px-4 py-3 sm:flex-row sm:items-center sm:justify-between">
      <div className="min-w-0 flex-1">
        <div className="flex items-baseline justify-between gap-3">
          <Link href={`/money/transactions/${tx.id}`} className="truncate font-medium hover:underline">
            {tx.title}
          </Link>
          <Money amount={tx.amount} currency={tx.currency} direction={tx.direction} className="sm:hidden" />
        </div>
        <div className="mt-0.5 flex flex-wrap items-center gap-x-2 gap-y-1 text-xs text-muted">
          <span>{formatShortDate(tx.date)}</span>
          <span>· {row.accountName}</span>
          {category && <span>· {category}</span>}
          {row.payeeName && !tx.title.toLowerCase().includes(row.payeeName.toLowerCase()) && <span>· {row.payeeName}</span>}
          {tx.transferId && <span>· ⇄ {t.tx.transfer}</span>}
          {tx.recurringRuleId && <span title={t.tx.fromRule}>· ↻</span>}
          {showStatus && <StatusBadge status={tx.status} />}
          {meta}
        </div>
      </div>
      <div className="flex items-center justify-between gap-3 sm:justify-end">
        <Money amount={tx.amount} currency={tx.currency} direction={tx.direction} className="hidden sm:inline" />
        {actions && <TxActions tx={tx} />}
      </div>
    </li>
  );
}

export function TxList({ children }: { children: ReactNode }) {
  return <ul className="card divide-y divide-border overflow-hidden">{children}</ul>;
}
