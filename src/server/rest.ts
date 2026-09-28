import "server-only";
import { ZodError } from "zod";
import type { ApiToken, TokenScope, Workspace } from "@/server/db/schema";
import { ApiError } from "@/server/api/errors";
import { hasScope, verifyToken } from "@/server/api/integrations";

export class HttpError extends Error {
  constructor(
    public status: number,
    message: string,
  ) {
    super(message);
  }
}

type Ctx<P> = { token: ApiToken; params: P; url: URL; req: Request };

function extractToken(req: Request, url: URL, allowQuery: boolean) {
  const auth = req.headers.get("authorization");
  if (auth?.toLowerCase().startsWith("bearer ")) return auth.slice(7).trim();
  const key = req.headers.get("x-api-key");
  if (key) return key.trim();
  // Calendar apps can't send headers, so the iCal feed accepts ?token=.
  if (allowQuery) return url.searchParams.get("token");
  return null;
}

/** Wraps a route handler: token auth + scope check + JSON errors. */
export function handler<P = Record<string, string>>(
  scope: TokenScope,
  fn: (ctx: Ctx<P>) => Promise<unknown>,
  opts: { allowQueryToken?: boolean } = {},
) {
  return async (req: Request, context: { params: Promise<P> }) => {
    const url = new URL(req.url);
    try {
      const raw = extractToken(req, url, !!opts.allowQueryToken);
      const token = raw ? await verifyToken(raw) : null;
      if (!token) throw new HttpError(401, "Missing or invalid API token");
      if (!hasScope(token, scope)) throw new HttpError(403, `Token lacks the "${scope}" scope`);
      const result = await fn({ token, params: await context.params, url, req });
      if (result instanceof Response) return result;
      return Response.json(result ?? { ok: true });
    } catch (err) {
      return errorResponse(err);
    }
  };
}

export function errorResponse(err: unknown) {
  if (err instanceof HttpError) return Response.json({ error: err.message }, { status: err.status });
  if (err instanceof ApiError) {
    return Response.json({ error: err.message }, { status: err.code === "not_found" ? 404 : err.code === "conflict" ? 409 : 400 });
  }
  if (err instanceof ZodError) {
    return Response.json({ error: "Invalid input", issues: err.issues }, { status: 400 });
  }
  const constraint = (err as { cause?: { constraint_name?: string } })?.cause?.constraint_name;
  if (constraint) return Response.json({ error: `Rejected by the database (${constraint})` }, { status: 400 });
  console.error("[api]", err);
  return Response.json({ error: "Internal error" }, { status: 500 });
}

export async function body(req: Request): Promise<Record<string, unknown>> {
  const text = await req.text();
  if (text.length > 100_000) throw new HttpError(413, "Body too large");
  if (!text) return {};
  try {
    const v = JSON.parse(text);
    if (v && typeof v === "object" && !Array.isArray(v)) return v;
  } catch {}
  throw new HttpError(400, "Body must be a JSON object");
}

/** Workspace to read from: the token's own restriction wins; asking for the other one is refused. */
export function readWorkspace(token: ApiToken, requested: string | null | undefined): Workspace | undefined {
  const ws = requested === "personal" || requested === "work" ? requested : undefined;
  if (requested && !ws) throw new HttpError(400, 'workspace must be "personal" or "work"');
  if (token.workspace && ws && ws !== token.workspace) throw new HttpError(403, `Token is limited to ${token.workspace}`);
  return token.workspace ?? ws;
}

/** For writes: the object's workspace must be allowed for this token. */
export function assertWorkspace(token: ApiToken, ws: Workspace) {
  if (token.workspace && token.workspace !== ws) throw new HttpError(403, `Token is limited to ${token.workspace}`);
}

export const qp = (url: URL, k: string) => url.searchParams.get(k) ?? undefined;
export const qint = (url: URL, k: string) => {
  const v = url.searchParams.get(k);
  return v && /^\d+$/.test(v) ? Number(v) : undefined;
};
export const qbool = (url: URL, k: string) => {
  const v = url.searchParams.get(k);
  return v === "true" || v === "1" ? true : v === "false" || v === "0" ? false : undefined;
};
