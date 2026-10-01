import { WebStandardStreamableHTTPServerTransport } from "@modelcontextprotocol/sdk/server/webStandardStreamableHttp.js";
import { hasScope, verifyToken } from "@/server/api/integrations";
import { createMcpServer } from "@/server/mcp/server";
import { mcpResource, preflight, publicOrigin, withCors } from "@/server/public-url";

export const dynamic = "force-dynamic";

/** 401 that tells MCP clients where to start OAuth (RFC 9728). */
function unauthorized(req: Request, error = "invalid_token", description = "Sign in to Catastif to use this connector") {
  const meta = `${publicOrigin(req)}/.well-known/oauth-protected-resource/api/mcp`;
  return withCors(
    Response.json(
      { error, error_description: description },
      {
        status: 401,
        headers: { "www-authenticate": `Bearer error="${error}", error_description="${description}", resource_metadata="${meta}"` },
      },
    ),
  );
}

/**
 * Streamable HTTP MCP endpoint (stateless: one server per request, JSON responses).
 * Auth: OAuth access token from the Claude app, or a Catastif API token with the "read" scope.
 */
export async function POST(req: Request) {
  const auth = req.headers.get("authorization");
  const raw = auth?.toLowerCase().startsWith("bearer ") ? auth.slice(7).trim() : null;
  const token = raw ? await verifyToken(raw) : null;
  if (!token) return unauthorized(req);
  if (!hasScope(token, "read")) return unauthorized(req, "insufficient_scope", "This token needs the read scope");

  const server = createMcpServer(token);
  const transport = new WebStandardStreamableHTTPServerTransport({ sessionIdGenerator: undefined, enableJsonResponse: true });
  try {
    await server.connect(transport);
    const res = await transport.handleRequest(req, {
      authInfo: {
        token: raw!,
        clientId: token.clientId ?? `token:${token.id}`,
        scopes: token.scopes,
        expiresAt: token.expiresAt ? Math.floor(token.expiresAt.getTime() / 1000) : undefined,
        resource: new URL(mcpResource(req)),
      },
    });
    return withCors(res);
  } finally {
    await server.close();
  }
}

// Stateless server: no standalone SSE stream and no sessions to delete.
const notAllowed = () =>
  withCors(Response.json({ jsonrpc: "2.0", error: { code: -32000, message: "Method not allowed" }, id: null }, { status: 405, headers: { allow: "POST, OPTIONS" } }));
export const GET = notAllowed;
export const DELETE = notAllowed;
export const OPTIONS = preflight;
