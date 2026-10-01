import { OAUTH_SCOPES } from "@/server/api/oauth";
import { mcpResource, preflight, publicOrigin, withCors } from "@/server/public-url";

export const dynamic = "force-dynamic";

/** RFC 9728 protected resource metadata, served at /.well-known/oauth-protected-resource[/api/mcp]. */
export function GET(req: Request) {
  return withCors(
    Response.json({
      resource: mcpResource(req),
      authorization_servers: [publicOrigin(req)],
      scopes_supported: OAUTH_SCOPES,
      bearer_methods_supported: ["header"],
      resource_name: "Catastif",
    }),
  );
}
export const OPTIONS = preflight;
