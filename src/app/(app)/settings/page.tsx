import Link from "next/link";
import { ActionForm, SubmitButton } from "@/components/forms";
import { Field, PageHeader, Section } from "@/components/ui";
import { changePasswordAction, logoutAction } from "@/server/actions/auth";
import { t } from "@/i18n";

export const metadata = { title: t.settings.title };

const LINKS = [
  { href: "/settings/accounts", title: t.settings.accounts, hint: t.settings.accountsHint },
  { href: "/settings/categories", title: t.settings.categories, hint: t.settings.categoriesHint },
  { href: "/settings/payees", title: t.settings.payees, hint: t.settings.payeesHint },
  { href: "/settings/recurring", title: t.settings.recurring, hint: t.settings.recurringHint },
];

export default function SettingsPage() {
  return (
    <>
      <PageHeader title={t.settings.title} />
      <ul className="mb-8 grid gap-3 sm:grid-cols-2">
        {LINKS.map((l) => (
          <li key={l.href}>
            <Link href={l.href} className="card block p-4 hover:bg-surface-2">
              <p className="font-medium">{l.title} →</p>
              <p className="mt-0.5 text-sm text-muted">{l.hint}</p>
            </Link>
          </li>
        ))}
      </ul>
      <Section title={t.settings.security}>
        <ActionForm action={changePasswordAction} resetOnSuccess className="card grid gap-4 p-4 sm:grid-cols-[1fr_1fr_auto] sm:items-end">
          <Field label={t.auth.currentPassword}>
            <input type="password" name="current" required className="input" autoComplete="current-password" />
          </Field>
          <Field label={t.auth.newPassword}>
            <input type="password" name="next" required minLength={12} className="input" autoComplete="new-password" />
          </Field>
          <SubmitButton>{t.auth.changePassword}</SubmitButton>
        </ActionForm>
        <form action={logoutAction} className="mt-3">
          <button className="btn">{t.nav.logout}</button>
        </form>
      </Section>
    </>
  );
}
