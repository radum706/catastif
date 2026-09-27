"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { t } from "@/i18n";

const icons: Record<string, string> = {
  home: "M3 11l9-7 9 7v9a1 1 0 0 1-1 1h-5v-6H9v6H4a1 1 0 0 1-1-1z",
  bills: "M6 3h12v18l-3-2-3 2-3-2-3 2zM9 8h6M9 12h6",
  collect: "M12 3v12m0 0l-4-4m4 4l4-4M4 19h16",
  transactions: "M4 7h16M4 12h16M4 17h10",
  forecast: "M3 17l5-5 4 4 8-8M15 8h5v5",
  settings: "M12 8a4 4 0 1 0 0 8 4 4 0 0 0 0-8zM3 12h2m14 0h2M12 3v2m0 14v2M5.6 5.6l1.4 1.4m10 10l1.4 1.4m0-12.8L17 7M7 17l-1.4 1.4",
};

export const NAV = [
  { href: "/", key: "home" },
  { href: "/bills", key: "bills" },
  { href: "/collect", key: "collect" },
  { href: "/transactions", key: "transactions" },
  { href: "/forecast", key: "forecast" },
] as const;

function Icon({ name }: { name: string }) {
  return (
    <svg viewBox="0 0 24 24" className="h-5 w-5" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
      <path d={icons[name]} />
    </svg>
  );
}

function useActive() {
  const path = usePathname();
  return (href: string) => (href === "/" ? path === "/" : path.startsWith(href));
}

export function TopNav({ badges }: { badges: Partial<Record<string, number>> }) {
  const isActive = useActive();
  return (
    <nav className="hidden items-center gap-1 md:flex">
      {[...NAV, { href: "/settings", key: "settings" as const }].map((n) => (
        <Link
          key={n.href}
          href={n.href}
          className={`relative rounded-lg px-3 py-1.5 text-sm ${isActive(n.href) ? "bg-surface-2 font-medium" : "text-muted hover:text-fg"}`}
        >
          {t.nav[n.key]}
          {!!badges[n.key] && <span className="ml-1.5 rounded-full bg-out px-1.5 text-[10px] font-semibold text-white">{badges[n.key]}</span>}
        </Link>
      ))}
    </nav>
  );
}

export function BottomNav({ badges }: { badges: Partial<Record<string, number>> }) {
  const isActive = useActive();
  return (
    <nav className="fixed inset-x-0 bottom-0 z-20 border-t border-border bg-surface/95 pb-[env(safe-area-inset-bottom)] backdrop-blur md:hidden">
      <ul className="grid grid-cols-5">
        {NAV.map((n) => (
          <li key={n.href}>
            <Link
              href={n.href}
              className={`relative flex flex-col items-center gap-0.5 py-2 text-[11px] ${isActive(n.href) ? "text-accent" : "text-muted"}`}
            >
              <Icon name={n.key} />
              {t.nav[n.key]}
              {!!badges[n.key] && (
                <span className="absolute right-[calc(50%-18px)] top-1 rounded-full bg-out px-1 text-[9px] font-semibold text-white">{badges[n.key]}</span>
              )}
            </Link>
          </li>
        ))}
      </ul>
    </nav>
  );
}

export function SettingsLink() {
  return (
    <Link href="/settings" className="btn btn-sm md:hidden" aria-label={t.nav.settings}>
      <Icon name="settings" />
    </Link>
  );
}
