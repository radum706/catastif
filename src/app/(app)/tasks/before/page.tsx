import Link from "next/link";
import { TaskList, TaskRow } from "@/components/task-row";
import { TxList, TxRow } from "@/components/tx-row";
import { Empty, Field, PageHeader, Section } from "@/components/ui";
import { addDays, isISODate, today } from "@/lib/dates";
import { tasks } from "@/server/api";
import { param } from "@/server/form-data";
import { getWorkspace } from "@/server/workspace";
import { t } from "@/i18n";

export const metadata = { title: t.tasks.before.title };

export default async function BeforePage({ searchParams }: PageProps<"/tasks/before">) {
  const sp = await searchParams;
  const raw = param(sp, "date");
  const now = today();
  const date = raw && isISODate(raw) ? raw : addDays(now, 7);
  const ws = await getWorkspace();
  const res = await tasks.todoBefore({ date, workspace: ws });

  return (
    <>
      <PageHeader title={t.tasks.before.title} intro={t.tasks.before.intro} />
      <form className="card mb-6 flex flex-wrap items-end gap-3 p-4">
        <Field label={t.tasks.before.date}>
          <input type="date" name="date" defaultValue={date} className="input" />
        </Field>
        <button className="btn btn-primary">{t.forecast.show}</button>
        {[3, 7, 14, 30].map((d) => (
          <Link key={d} href={`/tasks/before?date=${addDays(now, d)}`} className="btn btn-sm">
            +{d}d
          </Link>
        ))}
      </form>
      <Section title={`${t.tasks.before.tasks} (${res.tasks.length})`}>
        {res.tasks.length ? (
          <TaskList>
            {res.tasks.map((r) => (
              <TaskRow key={r.task.id} row={r} />
            ))}
          </TaskList>
        ) : (
          <Empty />
        )}
      </Section>
      <Section title={`${t.tasks.before.money} (${res.money.length})`}>
        {res.money.length ? (
          <TxList>
            {res.money.map((r) => (
              <TxRow key={r.tx.id} row={r} />
            ))}
          </TxList>
        ) : (
          <Empty />
        )}
      </Section>
    </>
  );
}
