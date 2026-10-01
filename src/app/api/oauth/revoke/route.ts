import { revoke } from "@/server/api/oauth";
import { preflight, withCors } from "@/server/public-url";

export const dynamic = "force-dynamic";

/** RFC 7009 token revocation. Always 200. */
export async function POST(req: Request) {
  const params = new URLSearchParams(await req.text());
  const t = params.get("token");
  if (t) await revoke(t);
  return withCors(new Response(null, { status: 200 }));
}
export const OPTIONS = preflight;
