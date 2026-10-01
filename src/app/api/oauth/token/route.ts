import { OAuthError, token } from "@/server/api/oauth";
import { preflight, withCors } from "@/server/public-url";

export const dynamic = "force-dynamic";

function basicAuth(req: Request) {
  const h = req.headers.get("authorization");
  if (!h?.toLowerCase().startsWith("basic ")) return null;
  const [id, secret] = Buffer.from(h.slice(6), "base64").toString("utf8").split(":");
  return id ? { id: decodeURIComponent(id), secret: decodeURIComponent(secret ?? "") } : null;
}

export async function POST(req: Request) {
  const type = req.headers.get("content-type") ?? "";
  const params = type.includes("application/json")
    ? new URLSearchParams(Object.entries((await req.json().catch(() => ({}))) as Record<string, string>))
    : new URLSearchParams(await req.text());
  try {
    const result = await token(params, basicAuth(req));
    return withCors(Response.json(result, { headers: { "cache-control": "no-store", pragma: "no-cache" } }));
  } catch (err) {
    if (err instanceof OAuthError) {
      return withCors(Response.json({ error: err.error, error_description: err.description }, { status: err.status, headers: { "cache-control": "no-store" } }));
    }
    throw err;
  }
}
export const OPTIONS = preflight;
