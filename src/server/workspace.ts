import "server-only";
import { cookies } from "next/headers";
import type { Workspace } from "@/server/db/schema";

export const WS_COOKIE = "catastif_ws";

/** The workspace the Tasks and Money modules are showing. */
export async function getWorkspace(): Promise<Workspace> {
  const v = (await cookies()).get(WS_COOKIE)?.value;
  return v === "work" ? "work" : "personal";
}

export type View = Workspace | "all";

/** Home and Calendar can also show both workspaces together. */
export function parseView(v: string | string[] | undefined, fallback: View = "all"): View {
  const s = Array.isArray(v) ? v[0] : v;
  return s === "personal" || s === "work" || s === "all" ? s : fallback;
}
