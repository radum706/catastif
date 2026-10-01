"use server";

import { revalidatePath } from "next/cache";
import { integrations, oauth } from "@/server/api";
import { requireSession } from "@/server/auth/session";
import type { TokenScope } from "@/server/db/schema";
import { t } from "@/i18n";
import { bool, errorMessage, int, optStr, str, type ActionState } from "./form";

async function act(fn: () => Promise<unknown>) {
  await requireSession();
  await fn();
  revalidatePath("/settings/integrations");
}

type TokenState = (NonNullable<ActionState> & { token?: string }) | null;

export async function createTokenAction(_: TokenState, fd: FormData): Promise<TokenState> {
  await requireSession();
  try {
    const { token } = await integrations.createToken({
      name: str(fd, "name"),
      scopes: fd.getAll("scopes").map(String) as TokenScope[],
      workspace: (optStr(fd, "workspace") as "personal" | "work" | null) ?? null,
    });
    revalidatePath("/settings/integrations");
    return { token, message: t.integrations.tokenCreated, ts: Date.now() };
  } catch (err) {
    return { error: errorMessage(err), ts: Date.now() };
  }
}

export async function revokeTokenAction(fd: FormData) {
  await act(() => integrations.revokeToken(int(fd, "id")));
}

export async function deleteTokenAction(fd: FormData) {
  await act(() => integrations.deleteToken(int(fd, "id")));
}

export async function createWebhookAction(_: ActionState, fd: FormData): Promise<ActionState> {
  await requireSession();
  try {
    const events = fd.getAll("events").map(String);
    await integrations.createWebhook({
      name: str(fd, "name"),
      url: str(fd, "url"),
      events: events.includes("*") ? ["*"] : (events as never[]),
      workspace: (optStr(fd, "workspace") as "personal" | "work" | null) ?? null,
    });
    revalidatePath("/settings/integrations");
    return { message: t.common.saved, ts: Date.now() };
  } catch (err) {
    return { error: errorMessage(err), ts: Date.now() };
  }
}

export async function toggleWebhookAction(fd: FormData) {
  await act(() => integrations.updateWebhook({ id: int(fd, "id"), active: bool(fd, "active") }));
}

export async function pingWebhookAction(fd: FormData) {
  await act(() => integrations.pingWebhook(int(fd, "id")));
}

export async function rotateSecretAction(fd: FormData) {
  await act(() => integrations.rotateWebhookSecret(int(fd, "id")));
}

export async function deleteWebhookAction(fd: FormData) {
  await act(() => integrations.deleteWebhook(int(fd, "id")));
}

export async function disconnectAppAction(fd: FormData) {
  await act(() => oauth.revokeClient(str(fd, "clientId")));
}

export async function retryDeliveryAction(fd: FormData) {
  await act(() => integrations.retryDelivery(int(fd, "id")));
}
