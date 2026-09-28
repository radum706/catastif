import Link from "next/link";
import { BottomNav, SettingsLink, TopNav, WorkspaceSwitcher } from "@/components/nav";
import { requireSession } from "@/server/auth/session";
import { inbox, payments, tasks } from "@/server/api";
import { getWorkspace } from "@/server/workspace";
import { today } from "@/lib/dates";
import { t } from "@/i18n";

export default async function AppLayout({ children }: LayoutProps<"/">) {
  await requireSession();
  const ws = await getWorkspace();
  const [counts, overdueTasks, inboxCount] = await Promise.all([
    payments.openCounts(ws),
    tasks.listTasks({ workspace: ws, completed: false, dueTo: today(), limit: 99 }),
    inbox.pendingCount(),
  ]);
  const badges = { money: counts.overdueBills, tasks: overdueTasks.length, inbox: inboxCount };

  return (
    <div data-ws={ws} className="min-h-screen pb-24 md:pb-10">
      <header className="sticky top-0 z-20 border-b border-border bg-bg/90 backdrop-blur">
        <div className="mx-auto flex max-w-6xl items-center justify-between gap-3 px-4 py-2.5">
          <div className="flex items-center gap-3">
            <Link href="/" className="flex items-center gap-2 font-semibold" aria-label={t.app.name}>
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src="/icon.svg" alt="" className="h-7 w-7" />
              <span className="hidden sm:inline">{t.app.name}</span>
            </Link>
            <WorkspaceSwitcher current={ws} />
          </div>
          <TopNav badges={badges} />
          <SettingsLink />
        </div>
      </header>
      <main className="mx-auto max-w-6xl px-4 py-5">{children}</main>
      <BottomNav badges={badges} />
    </div>
  );
}
