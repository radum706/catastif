import { today } from "@/lib/dates";
import { emit } from "./events";
import { bills } from "./payments";
import { listTasks } from "./tasks";
import { WORKSPACES } from "./workspace";

/**
 * Once a day: one "bill.overdue" and one "task.overdue" event per workspace listing everything late.
 * n8n can turn these into a morning message, an email, a ntfy push…
 */
export async function overdueDigest() {
  const t = today();
  const sent: string[] = [];
  for (const workspace of WORKSPACES) {
    const [b, late] = await Promise.all([
      bills({ workspace }),
      listTasks({ workspace, completed: false, dueTo: t, limit: 200 }),
    ]);
    if (b.overdue.length) {
      await emit("bill.overdue", workspace, {
        date: t,
        items: b.overdue.map((r) => ({ id: r.tx.id, title: r.tx.title, amount: r.tx.amount, currency: r.tx.currency, due: r.due, daysLate: -r.daysLeft, account: r.accountName })),
      });
      sent.push(`${workspace}:bills=${b.overdue.length}`);
    }
    const overdueTasks = late.filter((r) => r.task.dueDate! < t);
    if (overdueTasks.length) {
      await emit("task.overdue", workspace, {
        date: t,
        items: overdueTasks.map((r) => ({ id: r.task.id, title: r.task.title, due: r.task.dueDate, project: r.projectName, priority: r.task.priority })),
      });
      sent.push(`${workspace}:tasks=${overdueTasks.length}`);
    }
  }
  return sent;
}
