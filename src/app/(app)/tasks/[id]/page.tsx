import Link from "next/link";
import { notFound } from "next/navigation";
import { ActionForm, ConfirmButton, SubmitButton } from "@/components/forms";
import { TaskCheck, TaskList, TaskRow } from "@/components/task-row";
import { TaskQuickAdd } from "@/components/task-quick-add";
import { TxList, TxRow } from "@/components/tx-row";
import { ColorDot, Field, Section, WorkspaceBadge } from "@/components/ui";
import { today } from "@/lib/dates";
import { addCommentAction, deleteCommentAction, deleteTaskAction, updateTaskAction } from "@/server/actions/tasks";
import { projects, tasks } from "@/server/api";
import { ApiError } from "@/server/api/errors";
import { fmt, t } from "@/i18n";

export default async function TaskPage({ params }: PageProps<"/tasks/[id]">) {
  const { id } = await params;
  const detail = await tasks.getTaskDetail(Number(id)).catch((e) => {
    if (e instanceof ApiError || Number.isNaN(Number(id))) notFound();
    throw e;
  });
  const { task } = detail;
  const projectList = await projects.listProjects({ workspace: task.workspace });
  const projectSections = await Promise.all(projectList.map((p) => projects.getProject(p.project.id)));
  const placement = task.sectionId ? `s:${task.sectionId}` : task.projectId ? `p:${task.projectId}` : "";
  const fmtTime = new Intl.DateTimeFormat("en-GB", { day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" });
  const back = task.parentId ? `/tasks/${task.parentId}` : task.projectId ? `/tasks/projects/${task.projectId}` : "/tasks";

  return (
    <>
      <nav className="mb-3 flex flex-wrap items-center gap-2 text-sm text-muted">
        <WorkspaceBadge ws={task.workspace} long />
        {detail.projectName && (
          <Link href={`/tasks/projects/${task.projectId}`} className="inline-flex items-center gap-1 hover:text-fg">
            <ColorDot color={detail.projectColor} /> {detail.projectName}
            {detail.sectionName && <span>› {detail.sectionName}</span>}
          </Link>
        )}
        {task.parentId && (
          <Link href={`/tasks/${task.parentId}`} className="hover:text-fg">
            ↳ {t.tasks.parent}: {detail.parentTitle}
          </Link>
        )}
      </nav>
      <div className="mb-5 flex items-start gap-3">
        <div className="pt-1">
          <TaskCheck id={task.id} completed={task.completed} size="lg" />
        </div>
        <h1 className={`text-2xl font-semibold tracking-tight ${task.completed ? "text-muted line-through" : ""}`}>{task.title}</h1>
      </div>

      <div className="grid gap-6 lg:grid-cols-[3fr_2fr]">
        <div>
          <ActionForm action={updateTaskAction} className="card mb-6 grid gap-3 p-4 sm:grid-cols-2">
            <input type="hidden" name="id" value={task.id} />
            <Field label={t.tasks.title_} className="sm:col-span-2">
              <input name="title" required defaultValue={task.title} className="input" />
            </Field>
            <Field label={t.tasks.notes} className="sm:col-span-2">
              <textarea name="notes" rows={4} defaultValue={task.notes ?? ""} className="input" />
            </Field>
            <div className="grid grid-cols-[3fr_2fr] gap-2">
              <Field label={t.tasks.dueDate}>
                <input type="date" name="dueDate" defaultValue={task.dueDate ?? ""} className="input" />
              </Field>
              <Field label={t.tasks.dueTime}>
                <input type="time" name="dueTime" defaultValue={task.dueTime?.slice(0, 5) ?? ""} className="input" />
              </Field>
            </div>
            <Field label={t.tasks.startDate}>
              <input type="date" name="startDate" defaultValue={task.startDate ?? ""} className="input" />
            </Field>
            <Field label={t.tasks.priority}>
              <select name="priority" defaultValue={task.priority} className="input">
                {(["none", "low", "medium", "high"] as const).map((p) => (
                  <option key={p} value={p}>{t.enums.priority[p]}</option>
                ))}
              </select>
            </Field>
            <Field label={t.tasks.estimate}>
              <input type="number" min={1} name="estimateMinutes" defaultValue={task.estimateMinutes ?? ""} className="input" />
            </Field>
            {!task.parentId && (
              <Field label={`${t.tasks.project} / ${t.tasks.section}`}>
                <select name="placement" defaultValue={placement} className="input">
                  <option value="">{t.tasks.noProject}</option>
                  {projectSections.map((p) => (
                    <optgroup key={p.id} label={p.name}>
                      <option value={`p:${p.id}`}>{p.name} — {t.tasks.noSection}</option>
                      {p.sections.map((s) => (
                        <option key={s.id} value={`s:${s.id}`}>{p.name} › {s.name}</option>
                      ))}
                    </optgroup>
                  ))}
                </select>
              </Field>
            )}
            <Field label={t.tasks.tags} hint={t.tasks.tagsHint}>
              <input name="tags" defaultValue={detail.tags.map((x) => x.name).join(", ")} className="input" />
            </Field>
            <div className="flex justify-end sm:col-span-2">
              <SubmitButton>{t.common.save}</SubmitButton>
            </div>
          </ActionForm>

          {!task.parentId && (
            <Section title={`${t.tasks.subtasks} (${detail.subtasksDone}/${detail.subtasks.length})`}>
              {detail.subtasks.length > 0 && (
                <TaskList>
                  {detail.subtasks.map((r) => (
                    <TaskRow key={r.task.id} row={r} showProject={false} />
                  ))}
                </TaskList>
              )}
              <div className="mt-2">
                <TaskQuickAdd today={today()} parentId={task.id} compact placeholder={`+ ${t.tasks.addSubtask}`} />
              </div>
            </Section>
          )}

          <Section
            title={t.tasks.money}
            aside={
              <span className="flex gap-1.5">
                <Link href={`/money/transactions/new?taskId=${task.id}&direction=out&status=upcoming&returnTo=/tasks/${task.id}`} className="btn btn-sm">
                  {t.tasks.addCost}
                </Link>
                <Link href={`/money/transactions/new?taskId=${task.id}&direction=in&status=upcoming&returnTo=/tasks/${task.id}`} className="btn btn-sm">
                  {t.tasks.addIncome}
                </Link>
              </span>
            }
          >
            {detail.money.length ? (
              <TxList>
                {detail.money.map((r) => (
                  <TxRow key={r.tx.id} row={r} />
                ))}
              </TxList>
            ) : (
              <p className="text-sm text-muted">{t.tasks.noMoney}</p>
            )}
          </Section>
        </div>

        <aside>
          <Section title={t.tasks.comments}>
            <ActionForm action={addCommentAction} resetOnSuccess className="mb-3">
              <input type="hidden" name="taskId" value={task.id} />
              <textarea name="body" required rows={2} placeholder={t.tasks.addComment} className="input" />
              <div className="mt-2 flex justify-end">
                <SubmitButton className="btn btn-sm btn-primary">{t.tasks.comment}</SubmitButton>
              </div>
            </ActionForm>
            <ol className="space-y-2">
              {detail.activity.map((a) =>
                a.kind === "comment" ? (
                  <li key={a.id} className="card p-3 text-sm">
                    <p className="whitespace-pre-wrap">{a.body}</p>
                    <div className="mt-1 flex items-center justify-between text-xs text-muted">
                      <span>{fmtTime.format(a.createdAt)}</span>
                      <form action={deleteCommentAction}>
                        <input type="hidden" name="id" value={a.id} />
                        <ConfirmButton message={t.common.confirmDelete} className="hover:text-out">×</ConfirmButton>
                      </form>
                    </div>
                  </li>
                ) : (
                  <li key={a.id} className="px-1 text-xs text-muted">
                    {fmtTime.format(a.createdAt)} ·{" "}
                    {a.kind === "updated"
                      ? fmt(t.tasks.activity.updated, {
                          fields: ((a.data?.fields as string[] | undefined) ?? [])
                            .map((f) => t.tasks.fields[f as keyof typeof t.tasks.fields] ?? f)
                            .join(", "),
                        })
                      : t.tasks.activity[a.kind]}
                  </li>
                ),
              )}
            </ol>
          </Section>
          <form action={deleteTaskAction} className="flex justify-end">
            <input type="hidden" name="id" value={task.id} />
            <input type="hidden" name="returnTo" value={back} />
            <ConfirmButton message={t.common.confirmDelete} className="btn btn-danger">{t.common.delete}</ConfirmButton>
          </form>
        </aside>
      </div>
    </>
  );
}
