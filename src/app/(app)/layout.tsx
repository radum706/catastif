import Link from "next/link";
import { BottomNav, SettingsLink, TopNav } from "@/components/nav";
import { requireSession } from "@/server/auth/session";
import { payments } from "@/server/api";
import { t } from "@/i18n";

export default async function AppLayout({ children }: LayoutProps<"/">) {
  await requireSession();
  const counts = await payments.openCounts();
  const badges = { bills: counts.overdueBills, collect: counts.lateIncome };

  return (
    <div className="min-h-screen pb-24 md:pb-10">
      <header className="sticky top-0 z-20 border-b border-border bg-bg/90 backdrop-blur">
        <div className="mx-auto flex max-w-5xl items-center justify-between gap-3 px-4 py-2.5">
          <Link href="/" className="flex items-center gap-2 font-semibold">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src="/icon.svg" alt="" className="h-7 w-7" />
            {t.app.name}
          </Link>
          <TopNav badges={badges} />
          <div className="flex items-center gap-2">
            <Link href="/transactions/new" className="btn btn-primary btn-sm">
              + {t.nav.add}
            </Link>
            <SettingsLink />
          </div>
        </div>
      </header>
      <main className="mx-auto max-w-5xl px-4 py-5">{children}</main>
      <BottomNav badges={badges} />
    </div>
  );
}
