"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useTransition } from "react";
import { setWorkspaceAction } from "@/server/actions/workspace";
import { t } from "@/i18n";

const icons: Record<string, string> = {
  home: "M3 11l9-7 9 7v9a1 1 0 0 1-1 1h-5v-6H9v6H4a1 1 0 0 1-1-1z",
  tasks: "M9 11l3 3 8-8M20 12v7a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h9",
  money: "M3 7h18v10H3zM3 10h18M7 14h3",
  calendar: "M4 6h16v14H4zM4 10h16M8 3v4m8-4v4",
  inbox: "M4 13l2-8h12l2 8M4 13v6h16v-6M4 13h5l1 2h4l1-2h5",
  settings: "M4 6h10M18 6h2M4 12h4M12 12h8M4 18h12M20 18h0M14 4v4M8 10v4M16 16v4",
};

export const MODULES = [
  { href: "/", key: "home" },
  { href: "/tasks", key: "tasks" },
  { href: "/money", key: "money" },
  { href: "/calendar", key: "calendar" },
  { href: "/inbox", key: "inbox" },
] as const;

export function Icon({ name, className = "h-5 w-5" }: { name: string; className?: string }) {
  return (
    <svg viewBox="0 0 24 24" className={className} fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
      <path d={icons[name]} />
    </svg>
  );
}

function useActive() {
  const path = usePathname();
  return (href: string, exact = false) => (href === "/" || exact ? path === href : path === href || path.startsWith(`${href}/`));
}

type Badges = Partial<Record<string, number>>;

function Badge({ n }: { n?: number }) {
  if (!n) return null;
  return <span className="ml-1.5 rounded-full bg-out px-1.5 text-[10px] font-semibold text-white">{n}</span>;
}

export function TopNav({ badges }: { badges: Badges }) {
  const isActive = useActive();
  return (
    <nav className="hidden items-center gap-1 md:flex">
      {MODULES.map((n) => (
        <Link
          key={n.href}
          href={n.href}
          className={`rounded-lg px-3 py-1.5 text-sm ${isActive(n.href) ? "bg-surface-2 font-medium" : "text-muted hover:text-fg"}`}
        >
          {t.nav[n.key]}
          <Badge n={badges[n.key]} />
        </Link>
      ))}
    </nav>
  );
}

export function BottomNav({ badges }: { badges: Badges }) {
  const isActive = useActive();
  return (
    <nav className="fixed inset-x-0 bottom-0 z-20 border-t border-border bg-surface/95 pb-[env(safe-area-inset-bottom)] backdrop-blur md:hidden">
      <ul className="grid grid-cols-5">
        {MODULES.map((n) => (
          <li key={n.href}>
            <Link
              href={n.href}
              className={`relative flex flex-col items-center gap-0.5 py-2 text-[11px] ${isActive(n.href) ? "text-accent" : "text-muted"}`}
            >
              <Icon name={n.key} />
              {t.nav[n.key]}
              {!!badges[n.key] && (
                <span className="absolute right-[calc(50%-20px)] top-1 rounded-full bg-out px-1 text-[9px] font-semibold text-white">
                  {badges[n.key]}
                </span>
              )}
            </Link>
          </li>
        ))}
      </ul>
    </nav>
  );
}

/** Sub-navigation inside a module (Tasks, Money). */
export function SubNav({ items }: { items: { href: string; label: string; exact?: boolean; badge?: number }[] }) {
  const isActive = useActive();
  return (
    <nav className="-mx-4 mb-5 overflow-x-auto px-4">
      <ul className="flex gap-1 border-b border-border">
        {items.map((i) => (
          <li key={i.href}>
            <Link
              href={i.href}
              className={`-mb-px flex items-center whitespace-nowrap border-b-2 px-3 py-2 text-sm ${
                isActive(i.href, i.exact) ? "border-accent font-medium text-fg" : "border-transparent text-muted hover:text-fg"
              }`}
            >
              {i.label}
              <Badge n={i.badge} />
            </Link>
          </li>
        ))}
      </ul>
    </nav>
  );
}

export function WorkspaceSwitcher({ current }: { current: "personal" | "work" }) {
  const [pending, start] = useTransition();
  return (
    <div role="radiogroup" aria-label={t.workspace.switch} className={`flex rounded-lg border border-border bg-surface p-0.5 text-sm ${pending ? "opacity-60" : ""}`}>
      {(["personal", "work"] as const).map((ws) => (
        <button
          key={ws}
          type="button"
          role="radio"
          aria-checked={current === ws}
          onClick={() => current !== ws && start(() => setWorkspaceAction(ws))}
          className={`rounded-md px-2.5 py-1 font-medium transition-colors ${
            current === ws ? (ws === "work" ? "bg-ws-work text-white dark:text-[#1e1b4b]" : "bg-ws-personal text-white dark:text-[#0b1f1d]") : "text-muted hover:text-fg"
          }`}
        >
          {t.enums.workspace[ws]}
        </button>
      ))}
    </div>
  );
}

export function SettingsLink() {
  return (
    <Link href="/settings" className="btn btn-sm" aria-label={t.nav.settings}>
      <Icon name="settings" className="h-4 w-4" />
    </Link>
  );
}
