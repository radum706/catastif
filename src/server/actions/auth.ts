"use server";

import { redirect } from "next/navigation";
import { changePassword, login, logout, requireSession, setupPassword } from "@/server/auth/session";
import { t } from "@/i18n";
import { str, type ActionState } from "./form";

const authError = (code: string) => t.auth.errors[code as keyof typeof t.auth.errors] ?? t.errors.generic;

export async function loginAction(_: ActionState, fd: FormData): Promise<ActionState> {
  const res = await login(String(fd.get("password") ?? ""));
  if (!res.ok) return { error: authError(res.error), ts: Date.now() };
  redirect("/");
}

export async function setupAction(_: ActionState, fd: FormData): Promise<ActionState> {
  const res = await setupPassword(str(fd, "setupToken"), String(fd.get("password") ?? ""));
  if (!res.ok) return { error: authError(res.error), ts: Date.now() };
  redirect("/settings/accounts");
}

export async function changePasswordAction(_: ActionState, fd: FormData): Promise<ActionState> {
  await requireSession();
  const res = await changePassword(String(fd.get("current") ?? ""), String(fd.get("next") ?? ""));
  if (!res.ok) return { error: authError(res.error), ts: Date.now() };
  return { message: t.common.saved, ts: Date.now() };
}

export async function logoutAction() {
  await logout();
  redirect("/login");
}
