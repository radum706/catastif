import { headers } from "next/headers";
import { ActionForm, ConfirmButton, SubmitButton } from "@/components/forms";
import { TokenForm } from "@/components/token-form";
import { Badge, Empty, Field, PageHeader, Section, WorkspaceBadge } from "@/components/ui";
import {
  createWebhookAction,
  deleteTokenAction,
  deleteWebhookAction,
  disconnectAppAction,
  pingWebhookAction,
  retryDeliveryAction,
  revokeTokenAction,
  rotateSecretAction,
  toggleWebhookAction,
} from "@/server/actions/integrations";
import { integrations, oauth } from "@/server/api";
import { WEBHOOK_EVENTS } from "@/server/db/schema";
import { fmt, t } from "@/i18n";

export const metadata = { title: t.integrations.title };

const when = new Intl.DateTimeFormat("en-GB", { day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" });

export default async function IntegrationsPage() {
  const [apps, tokens, hooks, deliveries] = await Promise.all([
    oauth.listConnectedApps(),
    integrations.listTokens(),
    integrations.listWebhooks(),
    integrations.listDeliveries({ limit: 25 }),
  ]);
  const h = await headers();
  const origin = process.env.PUBLIC_URL?.replace(/\/+$/, "") || `${h.get("x-forwarded-proto") ?? "http"}://${h.get("host")}`;
  const hookName = new Map(hooks.map((w) => [w.id, w.name]));

  return (
    <>
      <PageHeader title={t.integrations.title} intro={`${t.integrations.intro} ${t.integrations.docs}`} />

      <Section title={t.integrations.claude}>
        <div className="card space-y-3 p-4 text-sm">
          <p>{t.integrations.claudeHint}</p>
          <p className="text-muted">{t.integrations.claudeApp}</p>
          <code className="num block overflow-x-auto rounded-lg bg-surface-2 px-3 py-2 text-xs">{`${origin}/api/mcp`}</code>
          <p className="text-muted">{t.integrations.claudeCode}</p>
          <code className="num block overflow-x-auto rounded-lg bg-surface-2 px-3 py-2 text-xs">{`claude mcp add --transport http catastif ${origin}/api/mcp --header "Authorization: Bearer cat_…"`}</code>
          <p className="text-xs text-muted">{t.integrations.publicNote}</p>
        </div>
        <h3 className="mb-2 mt-4 text-sm font-semibold">{t.integrations.connected}</h3>
        {apps.length === 0 ? (
          <p className="text-sm text-muted">{t.integrations.noneConnected}</p>
        ) : (
          <ul className="card divide-y divide-border">
            {apps.map(({ client, grant, lastGrant }) => (
              <li key={client.id} className="flex flex-wrap items-center justify-between gap-2 px-4 py-2.5 text-sm">
                <span className="flex flex-wrap items-center gap-2">
                  <span className="font-medium">{client.name}</span>
                  {grant?.scopes.map((s) => (
                    <Badge key={s}>{s}</Badge>
                  ))}
                  {grant?.workspace && <WorkspaceBadge ws={grant.workspace} long />}
                  {lastGrant && <span className="text-xs text-muted">{fmt(t.integrations.since, { when: when.format(new Date(lastGrant)) })}</span>}
                </span>
                <form action={disconnectAppAction}>
                  <input type="hidden" name="clientId" value={client.id} />
                  <ConfirmButton message={t.common.confirmDelete}>{t.integrations.disconnect}</ConfirmButton>
                </form>
              </li>
            ))}
          </ul>
        )}
      </Section>

      <Section title={t.integrations.tokens}>
        <p className="mb-2 text-sm text-muted">{t.integrations.tokensHint}</p>
        <div className="mb-3">
          <TokenForm />
        </div>
        {tokens.length > 0 && (
          <ul className="card divide-y divide-border">
            {tokens.map((tok) => (
              <li key={tok.id} className="flex flex-wrap items-center justify-between gap-2 px-4 py-2.5 text-sm">
                <span className="flex flex-wrap items-center gap-2">
                  <span className={`font-medium ${tok.revokedAt ? "text-muted line-through" : ""}`}>{tok.name}</span>
                  <code className="text-xs text-muted">{tok.prefix}…</code>
                  {tok.scopes.map((s) => (
                    <Badge key={s}>{s}</Badge>
                  ))}
                  {tok.workspace && <WorkspaceBadge ws={tok.workspace} long />}
                  <span className="text-xs text-muted">
                    {tok.revokedAt ? t.integrations.revoked : tok.lastUsedAt ? fmt(t.integrations.lastUsed, { when: when.format(tok.lastUsedAt) }) : t.integrations.never}
                  </span>
                </span>
                <form action={tok.revokedAt ? deleteTokenAction : revokeTokenAction}>
                  <input type="hidden" name="id" value={tok.id} />
                  <ConfirmButton message={t.common.confirmDelete}>{tok.revokedAt ? t.common.delete : t.integrations.revoke}</ConfirmButton>
                </form>
              </li>
            ))}
          </ul>
        )}
      </Section>

      <Section title={t.integrations.webhooks}>
        <p className="mb-2 text-sm text-muted">{t.integrations.webhooksHint}</p>
        <ActionForm action={createWebhookAction} resetOnSuccess className="card mb-3 grid gap-3 p-4 sm:grid-cols-2">
          <Field label={t.common.name}>
            <input name="name" required className="input" placeholder="n8n – new tasks" />
          </Field>
          <Field label={t.integrations.url}>
            <input name="url" type="url" required className="input" placeholder="https://n8n.example/webhook/…" />
          </Field>
          <fieldset className="sm:col-span-2">
            <legend className="label">{t.integrations.events}</legend>
            <div className="flex flex-wrap gap-x-4 gap-y-1 text-sm">
              <label className="flex items-center gap-1.5 font-medium">
                <input type="checkbox" name="events" value="*" /> {t.integrations.allEvents}
              </label>
              {WEBHOOK_EVENTS.filter((e) => e !== "ping").map((e) => (
                <label key={e} className="flex items-center gap-1.5">
                  <input type="checkbox" name="events" value={e} /> <code className="text-xs">{e}</code>
                </label>
              ))}
            </div>
          </fieldset>
          <Field label={t.integrations.workspace}>
            <select name="workspace" className="input" defaultValue="">
              <option value="">{t.integrations.both}</option>
              <option value="personal">{t.enums.workspace.personal}</option>
              <option value="work">{t.enums.workspace.work}</option>
            </select>
          </Field>
          <div className="flex items-end justify-end">
            <SubmitButton>{t.integrations.addWebhook}</SubmitButton>
          </div>
        </ActionForm>
        {hooks.length > 0 && (
          <ul className="space-y-2">
            {hooks.map((w) => (
              <li key={w.id} className="card p-3 text-sm">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <span className="flex flex-wrap items-center gap-2">
                    <span className={`font-medium ${w.active ? "" : "text-muted"}`}>{w.name}</span>
                    {!w.active && <Badge>{t.integrations.paused}</Badge>}
                    {w.workspace && <WorkspaceBadge ws={w.workspace} long />}
                    {w.lastStatus !== null || w.lastError ? (
                      <Badge tone={w.lastError ? "danger" : "good"}>{w.lastError ?? w.lastStatus}</Badge>
                    ) : null}
                  </span>
                  <span className="flex flex-wrap gap-1">
                    {(
                      [
                        [pingWebhookAction, t.integrations.ping, {}],
                        [toggleWebhookAction, w.active ? t.integrations.pause : t.integrations.resume, { active: String(!w.active) }],
                        [rotateSecretAction, t.integrations.rotate, {}],
                      ] as const
                    ).map(([action, label, extra]) => (
                      <form key={label} action={action}>
                        <input type="hidden" name="id" value={w.id} />
                        {Object.entries(extra).map(([k, v]) => (
                          <input key={k} type="hidden" name={k} value={v} />
                        ))}
                        <SubmitButton className="btn btn-sm">{label}</SubmitButton>
                      </form>
                    ))}
                    <form action={deleteWebhookAction}>
                      <input type="hidden" name="id" value={w.id} />
                      <ConfirmButton message={t.common.confirmDelete}>{t.common.delete}</ConfirmButton>
                    </form>
                  </span>
                </div>
                <p className="mt-1 truncate text-xs text-muted">{w.url}</p>
                <p className="mt-1 flex flex-wrap gap-1 text-xs">
                  {w.events.map((e) => (
                    <code key={e} className="rounded bg-surface-2 px-1">{e}</code>
                  ))}
                </p>
                <details className="mt-1 text-xs">
                  <summary className="cursor-pointer text-muted">{t.integrations.secret}</summary>
                  <code className="num mt-1 block overflow-x-auto rounded bg-surface-2 px-2 py-1">{w.secret}</code>
                </details>
              </li>
            ))}
          </ul>
        )}
      </Section>

      <Section title={t.integrations.deliveries}>
        {deliveries.length === 0 ? (
          <Empty />
        ) : (
          <div className="card overflow-x-auto">
            <table className="w-full text-sm">
              <tbody className="divide-y divide-border">
                {deliveries.map((d) => (
                  <tr key={d.id}>
                    <td className="whitespace-nowrap px-3 py-1.5 text-xs text-muted">{when.format(d.createdAt)}</td>
                    <td className="px-3 py-1.5"><code className="text-xs">{d.event}</code></td>
                    <td className="px-3 py-1.5 text-xs">{hookName.get(d.webhookId)}</td>
                    <td className="px-3 py-1.5">
                      <Badge tone={d.status === "delivered" ? "good" : d.status === "failed" ? "danger" : "warn"}>
                        {t.integrations.status[d.status]} {d.attempts > 1 ? `×${d.attempts}` : ""}
                      </Badge>
                      {d.error && <span className="ml-2 text-xs text-out">{d.error}</span>}
                    </td>
                    <td className="px-3 py-1.5 text-right">
                      {d.status === "failed" && (
                        <form action={retryDeliveryAction}>
                          <input type="hidden" name="id" value={d.id} />
                          <SubmitButton className="btn btn-sm">{t.integrations.retry}</SubmitButton>
                        </form>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </Section>

      <Section title={t.integrations.ical}>
        <p className="mb-2 text-sm text-muted">{t.integrations.icalHint}</p>
        <code className="num block overflow-x-auto rounded-lg bg-surface-2 px-3 py-2 text-xs">{`${origin}/api/v1/ical?token=cat_…&workspace=work`}</code>
      </Section>
    </>
  );
}
