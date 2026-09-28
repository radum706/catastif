import "server-only";
import { createHash, randomBytes, timingSafeEqual } from "node:crypto";
import { hash, verify } from "@node-rs/argon2";
import { eq, lt } from "drizzle-orm";
import { cookies, headers } from "next/headers";
import { redirect } from "next/navigation";
import { db } from "@/server/db/client";
import { appUser, sessions } from "@/server/db/schema";

export const SESSION_COOKIE = "catastif_session";
const MIN_PASSWORD = 12;

function sessionDays() {
  const n = Number(process.env.SESSION_DAYS ?? 30);
  return Number.isFinite(n) && n > 0 ? n : 30;
}

const sha256 = (s: string) => createHash("sha256").update(s).digest("hex");

function safeEqual(a: string, b: string) {
  const ba = Buffer.from(sha256(a));
  const bb = Buffer.from(sha256(b));
  return timingSafeEqual(ba, bb);
}

// Simple brute-force brake: after 5 failures, each attempt waits longer (max 30 s).
let failures = 0;
async function brake() {
  if (failures >= 5) await new Promise((r) => setTimeout(r, Math.min(30_000, 1000 * 2 ** (failures - 5))));
}

export async function hasUser() {
  const [row] = await db.select({ id: appUser.id }).from(appUser).limit(1);
  return !!row;
}

async function startSession(userId: number) {
  const token = randomBytes(32).toString("base64url");
  const expiresAt = new Date(Date.now() + sessionDays() * 86_400_000);
  const ua = (await headers()).get("user-agent")?.slice(0, 300) ?? null;
  await db.insert(sessions).values({ id: sha256(token), userId, expiresAt, userAgent: ua });
  (await cookies()).set(SESSION_COOKIE, token, {
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.COOKIE_SECURE === "true",
    path: "/",
    expires: expiresAt,
  });
}

export type AuthResult = { ok: true } | { ok: false; error: string };

/** First run only: creates the single user. Requires SETUP_TOKEN from .env. */
export async function setupPassword(setupToken: string, password: string): Promise<AuthResult> {
  await brake();
  const expected = process.env.SETUP_TOKEN;
  if (!expected || expected.length < 8) return { ok: false, error: "setupDisabled" };
  if (!safeEqual(setupToken, expected)) {
    failures++;
    return { ok: false, error: "badSetupToken" };
  }
  if (password.length < MIN_PASSWORD) return { ok: false, error: "passwordTooShort" };
  if (await hasUser()) return { ok: false, error: "alreadySetUp" };
  const [user] = await db.insert(appUser).values({ passwordHash: await hash(password) }).returning();
  await startSession(user.id);
  return { ok: true };
}

export async function login(password: string): Promise<AuthResult> {
  await brake();
  const [user] = await db.select().from(appUser).limit(1);
  if (!user || !(await verify(user.passwordHash, password))) {
    failures++;
    return { ok: false, error: "badPassword" };
  }
  failures = 0;
  await startSession(user.id);
  await db.delete(sessions).where(lt(sessions.expiresAt, new Date()));
  return { ok: true };
}

export async function changePassword(current: string, next: string): Promise<AuthResult> {
  const [user] = await db.select().from(appUser).limit(1);
  if (!user || !(await verify(user.passwordHash, current))) return { ok: false, error: "badPassword" };
  if (next.length < MIN_PASSWORD) return { ok: false, error: "passwordTooShort" };
  await db.update(appUser).set({ passwordHash: await hash(next), updatedAt: new Date() }).where(eq(appUser.id, user.id));
  // Sign out every other device.
  await db.delete(sessions).where(eq(sessions.userId, user.id));
  await startSession(user.id);
  return { ok: true };
}

export async function getSession() {
  const token = (await cookies()).get(SESSION_COOKIE)?.value;
  if (!token) return null;
  const [row] = await db.select().from(sessions).where(eq(sessions.id, sha256(token)));
  if (!row || row.expiresAt < new Date()) return null;
  return row;
}

/** Call at the top of every protected page and server action. */
export async function requireSession() {
  const session = await getSession();
  if (!session) redirect("/login");
  return session;
}

export async function logout() {
  const jar = await cookies();
  const token = jar.get(SESSION_COOKIE)?.value;
  if (token) await db.delete(sessions).where(eq(sessions.id, sha256(token)));
  jar.delete(SESSION_COOKIE);
}

export async function purgeExpiredSessions() {
  await db.delete(sessions).where(lt(sessions.expiresAt, new Date()));
}
