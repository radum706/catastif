import { OAUTH_SCOPES } from "@/server/api/oauth";
import { preflight, publicOrigin, withCors } from "@/server/public-url";

export const dynamic = "force-dynamic";

/** RFC 8414 authorization server metadata, served at /.well-known/oauth-authorization-server. */
export function GET(req: Request) {
  const base = publicOrigin(req);
  return withCors(
    Response.json({
      issuer: base,
      authorization_endpoint: `${base}/api/oauth/authorize`,
      token_endpoint: `${base}/api/oauth/token`,
      registration_endpoint: `${base}/api/oauth/register`,
      revocation_endpoint: `${base}/api/oauth/revoke`,
      response_types_supported: ["code"],
      grant_types_supported: ["authorization_code", "refresh_token"],
      code_challenge_methods_supported: ["S256"],
      token_endpoint_auth_methods_supported: ["none", "client_secret_post", "client_secret_basic"],
      revocation_endpoint_auth_methods_supported: ["none", "client_secret_post", "client_secret_basic"],
      scopes_supported: OAUTH_SCOPES,
      service_documentation: `${base}/settings/integrations`,
    }),
  );
}
export const OPTIONS = preflight;
