import { afterAll, beforeEach, describe, expect, it } from "vitest";
import { hasDb, resetDb } from "./db";
import { closeDb } from "@/server/db/client";
import { accounts, projects, tasks, transactions } from "@/server/api";
import { addDays, today } from "@/lib/dates";

describe.skipIf(!hasDb)("tasks API (integration)", () => {
  beforeEach(resetDb);
  afterAll(closeDb);

  it("creates a board project with sections and places tasks", async () => {
    const p = await projects.createProject({ workspace: "work", name: "Villa Popescu", template: "board" });
    const detail = await projects.getProject(p.id);
    expect(detail.sections.map((s) => s.name)).toEqual(["To do", "In progress", "Done"]);
    const [todo, doing] = detail.sections;

    const a = await tasks.createTask({ sectionId: todo.id, title: "Measure rooms", tags: ["site", "Site"] });
    expect(a).toMatchObject({ workspace: "work", projectId: p.id, sectionId: todo.id });
    const b = await tasks.createTask({ projectId: p.id, sectionId: todo.id, title: "Order tiles", dueDate: addDays(today(), 2) });
    expect(b.position).toBeGreaterThan(a.position);

    // Drag b above a, then into "In progress".
    await tasks.moveTask({ id: b.id, sectionId: todo.id, beforeId: a.id });
    let rows = await tasks.listTasks({ projectId: p.id, sectionId: todo.id });
    expect(rows.map((r) => r.task.title).sort()).toEqual(["Measure rooms", "Order tiles"]);
    const ordered = [...rows].sort((x, y) => x.task.position - y.task.position);
    expect(ordered[0].task.id).toBe(b.id);
    await tasks.moveTask({ id: b.id, sectionId: doing.id });
    rows = await tasks.listTasks({ sectionId: doing.id });
    expect(rows.map((r) => r.task.id)).toEqual([b.id]);

    // Tags are de-duplicated case-insensitively and scoped to the workspace.
    const [row] = await tasks.listTasks({ projectId: p.id, q: "measure" });
    expect(row.tags.map((t) => t.name)).toEqual(["site"]);

    const list = await projects.listProjects({ workspace: "work" });
    expect(list[0]).toMatchObject({ open: 2, done: 0 });
    expect(await projects.listProjects({ workspace: "personal" })).toHaveLength(0);
  });

  it("refuses to mix workspaces", async () => {
    const work = await projects.createProject({ workspace: "work", name: "Site" });
    await expect(tasks.createTask({ workspace: "personal", projectId: work.id, title: "x" })).rejects.toThrow(/other workspace/);
    const personalTask = await tasks.createTask({ workspace: "personal", title: "Dentist" });
    const acc = await accounts.createAccount({ name: "BT", workspace: "work", currency: "RON" });
    await expect(
      transactions.createTransaction({ title: "x", direction: "out", amount: 100, accountId: acc.id, taskId: personalTask.id }),
    ).rejects.toThrow(/other workspace/);
    await expect(tasks.createTask({ title: "no home" })).rejects.toThrow(/workspace/);
  });

  it("subtasks, completion, comments and activity", async () => {
    const parent = await tasks.createTask({ workspace: "personal", title: "Move flat" });
    const sub = await tasks.createTask({ parentId: parent.id, title: "Book van" });
    expect(sub.workspace).toBe("personal");
    await expect(tasks.createTask({ parentId: sub.id, title: "too deep" })).rejects.toThrow(/Subtasks/);

    await tasks.setCompleted({ id: sub.id, completed: true });
    await tasks.updateTask({ id: parent.id, dueDate: today(), priority: "high" });
    await tasks.addComment({ taskId: parent.id, body: "Ask Ion for the van" });
    const d = await tasks.getTaskDetail(parent.id);
    expect(d.subtasks).toHaveLength(1);
    expect(d).toMatchObject({ subtasks: [{ task: { completed: true } }], subtasksDone: 1 });
    expect(d.activity.map((a) => a.kind)).toEqual(["comment", "updated", "created"]);
    expect(d.activity[1].data).toEqual({ fields: ["priority", "dueDate"] });

    await expect(tasks.updateTask({ id: parent.id, startDate: addDays(today(), 3) })).rejects.toThrow(/Start date/);
  });

  it("My Tasks buckets and 'to do before'", async () => {
    const t = today();
    const mk = (title: string, dueDate: string | null) => tasks.createTask({ workspace: "personal", title, dueDate });
    await mk("late", addDays(t, -2));
    await mk("now", t);
    await mk("soon", addDays(t, 3));
    await mk("far", addDays(t, 30));
    await mk("someday", null);
    const done = await mk("done", t);
    await tasks.setCompleted({ id: done.id, completed: true });

    const my = await tasks.myTasks({ workspace: "personal" });
    const titles = (rows: { task: { title: string } }[]) => rows.map((r) => r.task.title);
    expect(titles(my.overdue)).toEqual(["late"]);
    expect(titles(my.today)).toEqual(["now"]);
    expect(titles(my.thisWeek)).toEqual(["soon"]);
    expect(titles(my.later)).toEqual(["far"]);
    expect(titles(my.noDate)).toEqual(["someday"]);
    expect(titles(my.recentlyCompleted)).toEqual(["done"]);

    const acc = await accounts.createAccount({ name: "ING", workspace: "personal", currency: "RON" });
    await transactions.createTransaction({ title: "Enel", direction: "out", amount: 100, accountId: acc.id, status: "upcoming", date: addDays(t, 2) });
    const before = await tasks.todoBefore({ date: addDays(t, 5), workspace: "personal" });
    expect(titles(before.tasks)).toEqual(["late", "now", "soon"]);
    expect(before.money.map((m) => m.tx.title)).toEqual(["Enel"]);
    expect((await tasks.todoBefore({ date: addDays(t, 5), workspace: "work" })).tasks).toHaveLength(0);
  });

  it("rolls up money linked to a project and its tasks", async () => {
    const p = await projects.createProject({ workspace: "work", name: "Kitchen", template: "empty" });
    const task = await tasks.createTask({ projectId: p.id, title: "Buy cabinets" });
    const acc = await accounts.createAccount({ name: "BT", workspace: "work", currency: "RON" });
    await transactions.createTransaction({ title: "Cabinets", direction: "out", amount: 500_000, accountId: acc.id, taskId: task.id, status: "upcoming", date: addDays(today(), 3) });
    await transactions.createTransaction({ title: "Advance", direction: "in", amount: 300_000, accountId: acc.id, projectId: p.id });
    expect(await projects.projectMoney(p.id)).toEqual([
      { currency: "RON", costPlanned: 500_000, costPaid: 0, incomePlanned: 0, incomeReceived: 300_000 },
    ]);
  });
});

import { calendar, recurring } from "@/server/api";

describe.skipIf(!hasDb)("calendar API (integration)", () => {
  beforeEach(resetDb);
  afterAll(closeDb);

  it("merges tasks, bills, income and recurring, per workspace, and reschedules", async () => {
    const t = today();
    const acc = await accounts.createAccount({ name: "ING", workspace: "personal", currency: "RON" });
    const biz = await accounts.createAccount({ name: "BT", workspace: "work", currency: "RON" });
    const task = await tasks.createTask({ workspace: "personal", title: "Dentist", dueDate: addDays(t, 1), dueTime: "09:30" });
    await tasks.createTask({ workspace: "work", title: "Site visit", dueDate: addDays(t, 1) });
    const bill = await transactions.createTransaction({ title: "Enel", direction: "out", amount: 100, accountId: acc.id, status: "upcoming", date: addDays(t, 2), dueDate: addDays(t, 3) });
    await transactions.createTransaction({ title: "Invoice 7", direction: "in", amount: 900, accountId: biz.id, status: "upcoming", date: addDays(t, 4) });
    await recurring.createRule({ title: "Gym", direction: "out", amount: 50, accountId: acc.id, startDate: addDays(t, 5), frequency: "yearly" });
    await recurring.updateRule({ id: (await recurring.listRules())[0].rule.id, active: false });
    await recurring.createRule({ title: "Netflix", direction: "out", amount: 60, accountId: acc.id, startDate: addDays(t, 6) });

    const all = await calendar.calendarItems({ from: t, to: addDays(t, 10) });
    expect(all.map((i) => `${i.kind}:${i.title}`)).toEqual([
      "task:Dentist",
      "task:Site visit",
      "bill:Enel",
      "income:Invoice 7",
      "bill:Netflix",
    ]);
    expect(all[0].time).toBe("09:30");
    expect(all[2].date).toBe(addDays(t, 3)); // bills sit on their due date

    const personal = await calendar.calendarItems({ from: t, to: addDays(t, 10), workspace: "personal" });
    expect(personal.every((i) => i.workspace === "personal")).toBe(true);

    await calendar.reschedule({ key: `task-${task.id}`, date: addDays(t, 7) });
    expect((await tasks.getTaskRow(task.id)).dueDate).toBe(addDays(t, 7));
    await calendar.reschedule({ key: `tx-${bill.id}`, date: addDays(t, 8) });
    expect(await transactions.getTransaction(bill.id)).toMatchObject({ dueDate: addDays(t, 8), date: addDays(t, 8) });
    await expect(calendar.reschedule({ key: "rule-1-2026-01-01", date: t })).rejects.toThrow(/can't be moved/);
  });
});
