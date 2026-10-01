import "server-only";

/**
 * The public origin Catastif is reached at (e.g. https://catastif.example.com behind Caddy).
 * Set PUBLIC_URL; otherwise it is guessed from the request (fine on Tailscale).
 */
export function publicOrigin(req: Request): string {
  const env = process.env.PUBLIC_URL?.replace(/\/+$/, "");
  if (env) return env;
  const url = new URL(req.url);
  const proto = req.headers.get("x-forwarded-proto")?.split(",")[0].trim() ?? url.protocol.replace(":", "");
  const host = req.headers.get("x-forwarded-host")?.split(",")[0].trim() ?? req.headers.get("host") ?? url.host;
  return `${proto}://${host}`;
}

export const mcpResource = (req: Request) => `${publicOrigin(req)}/api/mcp`;

export const CORS: Record<string, string> = {
  "access-control-allow-origin": "*",
  "access-control-allow-methods": "GET, POST, DELETE, OPTIONS",
  "access-control-allow-headers": "authorization, content-type, accept, mcp-protocol-version, mcp-session-id, last-event-id",
  "access-control-expose-headers": "mcp-session-id, www-authenticate",
  "access-control-max-age": "86400",
};

export function withCors(res: Response) {
  for (const [k, v] of Object.entries(CORS)) res.headers.set(k, v);
  return res;
}

export const preflight = () => new Response(null, { status: 204, headers: CORS });
