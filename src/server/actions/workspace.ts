"use server";

import { cookies } from "next/headers";
import { revalidatePath } from "next/cache";
import { requireSession } from "@/server/auth/session";
import { WS_COOKIE } from "@/server/workspace";

export async function setWorkspaceAction(workspace: "personal" | "work") {
  await requireSession();
  (await cookies()).set(WS_COOKIE, workspace === "work" ? "work" : "personal", {
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.COOKIE_SECURE === "true",
    path: "/",
    maxAge: 60 * 60 * 24 * 365,
  });
  revalidatePath("/", "layout");
}
