// A small OAuth 2.1 authorization server so the Claude app (and other MCP clients) can
// connect to /api/mcp: dynamic client registration (RFC 7591), authorization code + PKCE (S256),
// refresh token rotation. Access tokens are ordinary api_tokens rows with an expiry.
import { createHash, randomBytes, timingSafeEqual } from "node:crypto";
import { and, count, desc, eq, gt, isNull, lt, max, or } from "drizzle-orm";
import { z } from "zod";
import { db } from "@/server/db/client";
import { apiTokens, oauthClients, oauthCodes, oauthRefreshTokens, type TokenScope, type Workspace } from "@/server/db/schema";

const sha256 = (v: string) => createHash("sha256").update(v).digest("hex");
const random = (bytes = 32) => randomBytes(bytes).toString("base64url");

export const ACCESS_TOKEN_SECONDS = 60 * 60;
const REFRESH_TOKEN_DAYS = 90;
const CODE_SECONDS = 10 * 60;

/** Scopes an MCP client can ask for. "inbox" = create drafts; "write" = change existing items. */
export const OAUTH_SCOPES = ["read", "inbox", "write"] as const satisfies readonly TokenScope[];

export class OAuthError extends Error {
  constructor(
    public error: string,
    public description: string,
    public status = 400,
  ) {
    super(description);
  }
}

// ---------- clients ----------

function validRedirect(uri: string) {
  try {
    const u = new URL(uri);
    if (u.hash) return false;
    if (u.protocol === "https:") return true;
    // Local clients such as Claude Code / MCP Inspector listen on loopback.
    return u.protocol === "http:" && ["localhost", "127.0.0.1", "[::1]"].includes(u.hostname);
  } catch {
    return false;
  }
}

export const registerInput = z.object({
  redirect_uris: z.array(z.string().max(2000)).min(1).max(10),
  client_name: z.string().trim().max(200).optional(),
  token_endpoint_auth_method: z.enum(["none", "client_secret_post", "client_secret_basic"]).default("none"),
  grant_types: z.array(z.string()).optional(),
  response_types: z.array(z.string()).optional(),
  scope: z.string().optional(),
});

export async function registerClient(input: unknown) {
  const parsed = registerInput.safeParse(input);
  if (!parsed.success) throw new OAuthError("invalid_client_metadata", parsed.error.issues.map((i) => i.message).join("; "));
  const data = parsed.data;
  const bad = data.redirect_uris.find((u) => !validRedirect(u));
  if (bad) throw new OAuthError("invalid_redirect_uri", `Redirect URI not allowed: ${bad}`);
  const id = `cc_${random(18)}`;
  const secret = data.token_endpoint_auth_method === "none" ? null : `ccs_${random(32)}`;
  const [row] = await db
    .insert(oauthClients)
    .values({ id, name: data.client_name || "MCP client", redirectUris: data.redirect_uris, secretHash: secret ? sha256(secret) : null })
    .returning();
  return {
    client_id: row.id,
    ...(secret ? { client_secret: secret, client_secret_expires_at: 0 } : {}),
    client_id_issued_at: Math.floor(row.createdAt.getTime() / 1000),
    client_name: row.name,
    redirect_uris: row.redirectUris,
    token_endpoint_auth_method: data.token_endpoint_auth_method,
    grant_types: ["authorization_code", "refresh_token"],
    response_types: ["code"],
  };
}

export async function getClient(clientId: string) {
  const [row] = await db.select().from(oauthClients).where(eq(oauthClients.id, clientId));
  return row ?? null;
}

function checkSecret(client: { secretHash: string | null }, secret: string | null | undefined) {
  if (!client.secretHash) return; // public client: PKCE protects the code
  if (!secret) throw new OAuthError("invalid_client", "Client authentication required", 401);
  const a = Buffer.from(sha256(secret));
  const b = Buffer.from(client.secretHash);
  if (a.length !== b.length || !timingSafeEqual(a, b)) throw new OAuthError("invalid_client", "Bad client secret", 401);
}

// ---------- authorization ----------

export type AuthorizeRequest = {
  clientId: string;
  redirectUri: string;
  codeChallenge: string;
  state: string | null;
  scope: string | null;
  resource: string | null;
};

/** Validates the /authorize query. Errors before the redirect URI is trusted are shown, not redirected. */
export async function validateAuthorize(q: URLSearchParams): Promise<{ req: AuthorizeRequest; clientName: string }> {
  const clientId = q.get("client_id") ?? "";
  const client = clientId ? await getClient(clientId) : null;
  if (!client) throw new OAuthError("invalid_client", "Unknown client. Remove the connector and add it again.");
  const redirectUri = q.get("redirect_uri") ?? (client.redirectUris.length === 1 ? client.redirectUris[0] : "");
  if (!client.redirectUris.includes(redirectUri)) throw new OAuthError("invalid_request", "redirect_uri is not registered for this client");
  if (q.get("response_type") !== "code") throw new OAuthError("unsupported_response_type", "Only response_type=code is supported");
  const codeChallenge = q.get("code_challenge") ?? "";
  if (!/^[A-Za-z0-9._~-]{43,128}$/.test(codeChallenge) || (q.get("code_challenge_method") ?? "plain") !== "S256") {
    throw new OAuthError("invalid_request", "PKCE with code_challenge_method=S256 is required");
  }
  return {
    req: { clientId, redirectUri, codeChallenge, state: q.get("state"), scope: q.get("scope"), resource: q.get("resource") },
    clientName: client.name,
  };
}

/** Requested scopes, or a sensible default (read + drafts). */
export function requestedScopes(scope: string | null): TokenScope[] {
  const asked = (scope ?? "").split(/\s+/).filter((s): s is (typeof OAUTH_SCOPES)[number] => (OAUTH_SCOPES as readonly string[]).includes(s));
  return asked.length ? [...new Set<TokenScope>(["read", ...asked])] : ["read", "inbox"];
}

export async function createCode(req: AuthorizeRequest, grant: { scopes: TokenScope[]; workspace: Workspace | null }) {
  const code = random(32);
  await db.insert(oauthCodes).values({
    codeHash: sha256(code),
    clientId: req.clientId,
    redirectUri: req.redirectUri,
    codeChallenge: req.codeChallenge,
    scopes: grant.scopes,
    workspace: grant.workspace,
    resource: req.resource,
    expiresAt: new Date(Date.now() + CODE_SECONDS * 1000),
  });
  return code;
}

// ---------- tokens ----------

async function issueTokens(clientId: string, clientName: string, grant: { scopes: TokenScope[]; workspace: Workspace | null; resource: string | null }) {
  const access = `cat_${random(24)}`;
  const refresh = `catr_${random(32)}`;
  await db.insert(apiTokens).values({
    name: `${clientName} (OAuth)`,
    prefix: access.slice(0, 10),
    tokenHash: sha256(access),
    scopes: grant.scopes,
    workspace: grant.workspace,
    clientId,
    expiresAt: new Date(Date.now() + ACCESS_TOKEN_SECONDS * 1000),
  });
  await db.insert(oauthRefreshTokens).values({
    tokenHash: sha256(refresh),
    clientId,
    scopes: grant.scopes,
    workspace: grant.workspace,
    resource: grant.resource,
    expiresAt: new Date(Date.now() + REFRESH_TOKEN_DAYS * 86_400_000),
  });
  return {
    access_token: access,
    token_type: "Bearer",
    expires_in: ACCESS_TOKEN_SECONDS,
    refresh_token: refresh,
    scope: grant.scopes.join(" "),
  };
}

const S256 = (verifier: string) => createHash("sha256").update(verifier).digest("base64url");

/** POST /token. `params` is the form body; `basic` the decoded Basic auth header, if any. */
export async function token(params: URLSearchParams, basic?: { id: string; secret: string } | null) {
  const clientId = basic?.id ?? params.get("client_id") ?? "";
  const client = clientId ? await getClient(clientId) : null;
  if (!client) throw new OAuthError("invalid_client", "Unknown client", 401);
  checkSecret(client, basic?.secret ?? params.get("client_secret"));

  const grantType = params.get("grant_type");
  if (grantType === "authorization_code") {
    const code = params.get("code") ?? "";
    const [row] = await db.select().from(oauthCodes).where(eq(oauthCodes.codeHash, sha256(code)));
    if (!row || row.clientId !== client.id || row.usedAt || row.expiresAt < new Date()) {
      throw new OAuthError("invalid_grant", "Code is invalid, expired or already used");
    }
    // Single use, even when the rest of the checks fail.
    const used = await db
      .update(oauthCodes)
      .set({ usedAt: new Date() })
      .where(and(eq(oauthCodes.codeHash, row.codeHash), isNull(oauthCodes.usedAt)))
      .returning();
    if (!used.length) throw new OAuthError("invalid_grant", "Code already used");
    if ((params.get("redirect_uri") ?? row.redirectUri) !== row.redirectUri) throw new OAuthError("invalid_grant", "redirect_uri mismatch");
    const verifier = params.get("code_verifier") ?? "";
    if (!verifier || S256(verifier) !== row.codeChallenge) throw new OAuthError("invalid_grant", "PKCE verification failed");
    return issueTokens(client.id, client.name, { scopes: row.scopes, workspace: row.workspace, resource: row.resource });
  }

  if (grantType === "refresh_token") {
    const raw = params.get("refresh_token") ?? "";
    const [row] = await db.select().from(oauthRefreshTokens).where(eq(oauthRefreshTokens.tokenHash, sha256(raw)));
    if (!row || row.clientId !== client.id || row.expiresAt < new Date()) throw new OAuthError("invalid_grant", "Refresh token is invalid or expired");
    if (row.usedAt) {
      // A rotated token came back: assume it leaked and disconnect the client.
      await revokeClient(client.id);
      throw new OAuthError("invalid_grant", "Refresh token was already used; the connection has been revoked");
    }
    await db.update(oauthRefreshTokens).set({ usedAt: new Date() }).where(eq(oauthRefreshTokens.tokenHash, row.tokenHash));
    return issueTokens(client.id, client.name, { scopes: row.scopes, workspace: row.workspace, resource: row.resource });
  }

  throw new OAuthError("unsupported_grant_type", "Use authorization_code or refresh_token");
}

/** RFC 7009: always succeeds. */
export async function revoke(raw: string) {
  const hash = sha256(raw);
  await db.update(apiTokens).set({ revokedAt: new Date() }).where(and(eq(apiTokens.tokenHash, hash), isNull(apiTokens.revokedAt)));
  await db.update(oauthRefreshTokens).set({ usedAt: new Date() }).where(eq(oauthRefreshTokens.tokenHash, hash));
}

// ---------- management ----------

/** Apps that hold a live refresh token, for Settings → Integrations. */
export async function listConnectedApps() {
  const now = new Date();
  const rows = await db
    .select({
      client: oauthClients,
      active: count(oauthRefreshTokens.tokenHash),
      lastGrant: max(oauthRefreshTokens.createdAt),
    })
    .from(oauthClients)
    .leftJoin(
      oauthRefreshTokens,
      and(eq(oauthRefreshTokens.clientId, oauthClients.id), isNull(oauthRefreshTokens.usedAt), gt(oauthRefreshTokens.expiresAt, now)),
    )
    .groupBy(oauthClients.id)
    .orderBy(desc(oauthClients.createdAt));
  const grants = await db
    .select({ clientId: oauthRefreshTokens.clientId, scopes: oauthRefreshTokens.scopes, workspace: oauthRefreshTokens.workspace })
    .from(oauthRefreshTokens)
    .where(and(isNull(oauthRefreshTokens.usedAt), gt(oauthRefreshTokens.expiresAt, now)));
  return rows
    .filter((r) => r.active > 0)
    .map((r) => ({ ...r, grant: grants.find((g) => g.clientId === r.client.id) ?? null }));
}

/** Disconnects an app: its tokens, codes and refresh tokens go with it. */
export async function revokeClient(clientId: string) {
  await db.delete(oauthClients).where(eq(oauthClients.id, clientId));
}

/** Housekeeping for the worker. */
export async function pruneOauth() {
  const now = new Date();
  await db.delete(oauthCodes).where(lt(oauthCodes.expiresAt, now));
  await db.delete(oauthRefreshTokens).where(or(lt(oauthRefreshTokens.expiresAt, now), lt(oauthRefreshTokens.usedAt, new Date(now.getTime() - 86_400_000))));
  await db.delete(apiTokens).where(and(lt(apiTokens.expiresAt, new Date(now.getTime() - 86_400_000))));
  // Clients that registered but never finished connecting.
  const stale = await db
    .select({ id: oauthClients.id })
    .from(oauthClients)
    .leftJoin(oauthRefreshTokens, eq(oauthRefreshTokens.clientId, oauthClients.id))
    .where(and(isNull(oauthRefreshTokens.tokenHash), lt(oauthClients.createdAt, new Date(now.getTime() - 86_400_000))));
  for (const s of stale) await revokeClient(s.id);
}
