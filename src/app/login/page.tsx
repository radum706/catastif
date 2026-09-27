import { redirect } from "next/navigation";
import { ActionForm, SubmitButton } from "@/components/forms";
import { Field } from "@/components/ui";
import { loginAction, setupAction } from "@/server/actions/auth";
import { getSession, hasUser } from "@/server/auth/session";
import { t } from "@/i18n";

export const metadata = { title: t.auth.title };

export default async function LoginPage() {
  if (await getSession()) redirect("/");
  const setup = !(await hasUser());

  return (
    <main className="mx-auto flex min-h-screen max-w-sm flex-col justify-center px-4">
      <div className="mb-6 flex items-center gap-3">
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img src="/icon.svg" alt="" className="h-10 w-10" />
        <div>
          <p className="text-xl font-semibold">{t.app.name}</p>
          <p className="text-sm text-muted">{setup ? t.auth.setupTitle : t.auth.title}</p>
        </div>
      </div>
      <div className="card p-5">
        {setup ? (
          <ActionForm action={setupAction} className="space-y-4">
            <p className="text-sm text-muted">{t.auth.setupIntro}</p>
            <Field label={t.auth.setupToken}>
              <input name="setupToken" type="password" required className="input" autoComplete="off" />
            </Field>
            <Field label={t.auth.newPassword}>
              <input name="password" type="password" required minLength={12} className="input" autoComplete="new-password" />
            </Field>
            <SubmitButton className="btn btn-primary w-full">{t.auth.create}</SubmitButton>
          </ActionForm>
        ) : (
          <ActionForm action={loginAction} className="space-y-4">
            <Field label={t.auth.password}>
              <input name="password" type="password" required autoFocus className="input" autoComplete="current-password" />
            </Field>
            <SubmitButton className="btn btn-primary w-full">{t.auth.login}</SubmitButton>
          </ActionForm>
        )}
      </div>
    </main>
  );
}
