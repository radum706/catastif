"use server";

import { revalidatePath } from "next/cache";
import { inbox } from "@/server/api";
import { requireSession } from "@/server/auth/session";
import { parseAmount } from "@/lib/money";
import { t } from "@/i18n";
import { errorMessage, FormError, int, optInt, optStr, str, type ActionState } from "./form";

export async function captureAction(_: ActionState, fd: FormData): Promise<ActionState> {
  await requireSession();
  try {
    const item = await inbox.capture({
      text: str(fd, "text"),
      source: "manual",
      workspace: (optStr(fd, "workspace") as "personal" | "work" | null) ?? null,
    });
    revalidatePath("/", "layout");
    return { message: item.error ? `${t.inbox.drafted} (${item.error})` : t.inbox.drafted, ts: Date.now() };
  } catch (err) {
    return { error: errorMessage(err), ts: Date.now() };
  }
}

function draftFrom(fd: FormData) {
  const kind = str(fd, "kind") as "task" | "transaction";
  if (kind === "task") {
    const tags = str(fd, "tags");
    return {
      kind,
      draft: {
        workspace: str(fd, "workspace"),
        title: str(fd, "title"),
        notes: optStr(fd, "notes"),
        dueDate: optStr(fd, "dueDate"),
        dueTime: optStr(fd, "dueTime"),
        priority: str(fd, "priority") || "none",
        projectId: optInt(fd, "projectId"),
        tags: tags ? tags.split(",").map((x) => x.trim()).filter(Boolean) : [],
      },
    };
  }
  const rawAmount = str(fd, "amount");
  const amount = rawAmount ? parseAmount(rawAmount) : null;
  if (rawAmount && amount === null) throw new FormError(t.errors.invalidAmount);
  return {
    kind,
    draft: {
      workspace: str(fd, "workspace"),
      title: str(fd, "title"),
      direction: str(fd, "direction"),
      amount,
      accountId: optInt(fd, "accountId"),
      status: str(fd, "status"),
      date: str(fd, "date"),
      dueDate: optStr(fd, "dueDate"),
      categoryId: optInt(fd, "categoryId"),
      payeeId: optInt(fd, "payeeId"),
      notes: optStr(fd, "notes"),
    },
  };
}

/** Save the edited draft, or approve it (turns it into a real task/transaction). */
export async function inboxDraftAction(_: ActionState, fd: FormData): Promise<ActionState> {
  await requireSession();
  try {
    const id = int(fd, "id");
    const { kind, draft } = draftFrom(fd);
    if (str(fd, "intent") === "approve") {
      await inbox.approve({ id, kind, draft });
    } else {
      await inbox.updateDraft({ id, kind, draft });
    }
    revalidatePath("/", "layout");
    return { ts: Date.now() };
  } catch (err) {
    return { error: errorMessage(err), ts: Date.now() };
  }
}

export async function redraftAction(fd: FormData) {
  await requireSession();
  await inbox.redraft({ id: int(fd, "id"), kind: str(fd, "kind") as "task" | "transaction" });
  revalidatePath("/inbox");
}

export async function rejectInboxAction(fd: FormData) {
  await requireSession();
  await inbox.reject(int(fd, "id"));
  revalidatePath("/", "layout");
}

export async function deleteInboxAction(fd: FormData) {
  await requireSession();
  await inbox.deleteInboxItem(int(fd, "id"));
  revalidatePath("/", "layout");
}
