import { OAuthError, registerClient } from "@/server/api/oauth";
import { preflight, withCors } from "@/server/public-url";

export const dynamic = "force-dynamic";

/** RFC 7591 dynamic client registration (the Claude app registers itself here). */
export async function POST(req: Request) {
  try {
    const body = await req.json().catch(() => null);
    return withCors(Response.json(await registerClient(body), { status: 201, headers: { "cache-control": "no-store" } }));
  } catch (err) {
    if (err instanceof OAuthError) return withCors(Response.json({ error: err.error, error_description: err.description }, { status: 400 }));
    throw err;
  }
}
export const OPTIONS = preflight;
