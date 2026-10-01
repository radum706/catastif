import { checkPassword } from "@/server/auth/session";
import { createCode, OAuthError, requestedScopes, validateAuthorize, type AuthorizeRequest } from "@/server/api/oauth";
import type { TokenScope, Workspace } from "@/server/db/schema";
import { publicOrigin } from "@/server/public-url";
import { fmt, t } from "@/i18n";

export const dynamic = "force-dynamic";

const esc = (s: string) => s.replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]!);

const LEVELS: Record<"read" | "inbox" | "write", TokenScope[]> = {
  read: ["read"],
  inbox: ["read", "inbox"],
  write: ["read", "inbox", "write"],
};

/**
 * The consent page is plain HTML from this route (no app session, no client JS), so the public
 * reverse proxy only needs to expose /api/oauth/*, /api/mcp and /.well-known/*.
 * The password is asked every time: consent can't be forged from another site.
 */
function page(body: string, status = 200) {
  return new Response(
    `<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<title>${esc(t.oauth.title)}</title><style>
:root{--bg:#f6f5f1;--s:#fff;--b:#e3e0d8;--fg:#1d1c1a;--m:#6b675f;--a:#0f766e;--o:#b91c1c}
@media(prefers-color-scheme:dark){:root{--bg:#121211;--s:#1b1a19;--b:#33312e;--fg:#ecebe7;--m:#9c978d;--a:#2dd4bf;--o:#f87171}}
*{box-sizing:border-box}body{margin:0;background:var(--bg);color:var(--fg);font:15px/1.5 system-ui,-apple-system,"Segoe UI",sans-serif}
main{max-width:440px;margin:6vh auto;padding:0 16px}.card{background:var(--s);border:1px solid var(--b);border-radius:14px;padding:20px}
h1{font-size:20px;margin:0 0 4px}p{margin:.4em 0}.m{color:var(--m);font-size:13px}label{display:block}
fieldset{border:0;padding:0;margin:16px 0 0}legend,.l{font-size:11px;font-weight:600;letter-spacing:.05em;text-transform:uppercase;color:var(--m);margin-bottom:6px}
.opt{display:flex;gap:8px;align-items:flex-start;padding:8px 0}.opt input{margin-top:4px}
input[type=password],select{width:100%;padding:9px 11px;border:1px solid var(--b);border-radius:9px;background:var(--s);color:var(--fg);font-size:16px}
.row{display:flex;gap:8px;margin-top:18px}button{flex:1;padding:10px;border-radius:9px;border:1px solid var(--b);background:var(--s);color:var(--fg);font-size:15px;font-weight:600;cursor:pointer}
button.p{background:var(--a);border-color:var(--a);color:#fff}.err{color:var(--o);font-weight:600}
.logo{display:flex;align-items:center;gap:10px;margin-bottom:14px;font-weight:600}
</style></head><body><main><div class="logo"><svg width="28" height="28" viewBox="0 0 64 64"><rect width="64" height="64" rx="14" fill="#0f766e"/><path d="M18 16h22a6 6 0 0 1 6 6v26H24a6 6 0 0 1-6-6z" fill="#f6f5f1"/><path d="M24 26h16M24 33h16M24 40h10" stroke="#0f766e" stroke-width="3" stroke-linecap="round"/></svg>Catastif</div>
<div class="card">${body}</div><p class="m">${esc(t.oauth.note)}</p></main></body></html>`,
    {
      status,
      headers: {
        "content-type": "text/html; charset=utf-8",
        "cache-control": "no-store",
        "x-frame-options": "DENY",
        "content-security-policy": "default-src 'none'; style-src 'unsafe-inline'; img-src data:; form-action 'self' https: http://localhost:* http://127.0.0.1:*; frame-ancestors 'none'",
        "referrer-policy": "no-referrer",
      },
    },
  );
}

function errorPage(message: string) {
  return page(`<h1>${esc(t.oauth.error)}</h1><p class="err">${esc(message)}</p>`, 400);
}

function consent(req: AuthorizeRequest, clientName: string, opts: { error?: string; level?: string; workspace?: string } = {}) {
  const asked = requestedScopes(req.scope);
  const level = opts.level ?? (asked.includes("inbox") || asked.includes("write") ? "inbox" : "read");
  const hidden = Object.entries({
    response_type: "code",
    client_id: req.clientId,
    redirect_uri: req.redirectUri,
    code_challenge: req.codeChallenge,
    code_challenge_method: "S256",
    state: req.state ?? "",
    scope: req.scope ?? "",
    resource: req.resource ?? "",
  })
    .map(([k, v]) => `<input type="hidden" name="${k}" value="${esc(v)}">`)
    .join("");
  const host = (() => {
    try {
      return new URL(req.redirectUri).host;
    } catch {
      return req.redirectUri;
    }
  })();
  const radios = (["read", "inbox", "write"] as const)
    .map(
      (l) =>
        `<label class="opt"><input type="radio" name="level" value="${l}"${l === level ? " checked" : ""}><span>${esc(t.oauth.levels[l])}${
          l === "inbox" ? ` <span class="m">(${esc(t.oauth.recommended)})</span>` : ""
        }</span></label>`,
    )
    .join("");
  const ws = opts.workspace ?? "";
  return page(
    `<h1>${esc(t.oauth.title)}</h1>
<p>${esc(fmt(t.oauth.wants, { client: clientName }))}</p><p class="m">${esc(fmt(t.oauth.redirect, { host }))}</p>
${opts.error ? `<p class="err">${esc(opts.error)}</p>` : ""}
<form method="post">${hidden}
<fieldset><legend>${esc(t.oauth.access)}</legend>${radios}</fieldset>
<fieldset><legend>${esc(t.oauth.workspace)}</legend><select name="workspace">
<option value=""${ws === "" ? " selected" : ""}>${esc(t.oauth.both)}</option>
<option value="personal"${ws === "personal" ? " selected" : ""}>${esc(t.enums.workspace.personal)}</option>
<option value="work"${ws === "work" ? " selected" : ""}>${esc(t.enums.workspace.work)}</option></select></fieldset>
<fieldset><label><span class="l">${esc(t.oauth.password)}</span><input type="password" name="password" autocomplete="current-password" autofocus></label></fieldset>
<div class="row"><button name="decision" value="deny">${esc(t.oauth.deny)}</button><button class="p" name="decision" value="allow">${esc(t.oauth.allow)}</button></div>
</form>`,
    opts.error ? 401 : 200,
  );
}

function redirectTo(req: AuthorizeRequest, params: Record<string, string>, issuer: string) {
  const url = new URL(req.redirectUri);
  for (const [k, v] of Object.entries(params)) url.searchParams.set(k, v);
  if (req.state) url.searchParams.set("state", req.state);
  url.searchParams.set("iss", issuer);
  return new Response(null, { status: 303, headers: { location: url.toString(), "cache-control": "no-store" } });
}

export async function GET(request: Request) {
  try {
    const { req, clientName } = await validateAuthorize(new URL(request.url).searchParams);
    return consent(req, clientName);
  } catch (err) {
    if (err instanceof OAuthError) return errorPage(err.description);
    throw err;
  }
}

export async function POST(request: Request) {
  const form = new URLSearchParams(await request.text());
  let validated: Awaited<ReturnType<typeof validateAuthorize>>;
  try {
    validated = await validateAuthorize(form);
  } catch (err) {
    if (err instanceof OAuthError) return errorPage(err.description);
    throw err;
  }
  const { req, clientName } = validated;
  const issuer = publicOrigin(request);
  if (form.get("decision") !== "allow") return redirectTo(req, { error: "access_denied" }, issuer);

  const level = (["read", "inbox", "write"] as const).find((l) => l === form.get("level")) ?? "read";
  const wsRaw = form.get("workspace");
  const workspace: Workspace | null = wsRaw === "personal" || wsRaw === "work" ? wsRaw : null;
  if (!(await checkPassword(form.get("password") ?? ""))) {
    return consent(req, clientName, { error: t.oauth.badPassword, level, workspace: workspace ?? "" });
  }
  const code = await createCode(req, { scopes: LEVELS[level], workspace });
  return redirectTo(req, { code }, issuer);
}
