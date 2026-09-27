import Link from "next/link";
import type { ReactNode } from "react";
import { formatMoney, type CurrencyCode } from "@/lib/money";
import { t } from "@/i18n";

export function PageHeader({ title, intro, actions }: { title: string; intro?: string; actions?: ReactNode }) {
  return (
    <div className="mb-5 flex flex-wrap items-end justify-between gap-3">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">{title}</h1>
        {intro && <p className="mt-1 text-sm text-muted">{intro}</p>}
      </div>
      {actions && <div className="flex flex-wrap gap-2">{actions}</div>}
    </div>
  );
}

export function Section({ title, aside, children, className = "" }: { title?: string; aside?: ReactNode; children: ReactNode; className?: string }) {
  return (
    <section className={`mb-6 ${className}`}>
      {title && (
        <div className="mb-2 flex items-baseline justify-between gap-2">
          <h2 className="text-sm font-semibold uppercase tracking-wide text-muted">{title}</h2>
          {aside}
        </div>
      )}
      {children}
    </section>
  );
}

export function Money({
  amount,
  currency,
  direction,
  className = "",
  colored = true,
}: {
  amount: number;
  currency: CurrencyCode;
  direction?: "in" | "out";
  className?: string;
  colored?: boolean;
}) {
  const value = direction === "out" ? -amount : amount;
  const color = !colored ? "" : value > 0 && direction ? "text-in" : value < 0 ? "text-out" : "";
  const sign = direction === "in" ? "+" : "";
  return <span className={`num whitespace-nowrap ${color} ${className}`}>{sign}{formatMoney(value, currency)}</span>;
}

const badgeTone = {
  neutral: "bg-surface-2 text-muted",
  warn: "bg-warn/15 text-warn",
  danger: "bg-out/15 text-out",
  good: "bg-in/15 text-in",
  accent: "bg-accent/15 text-accent",
};

export function Badge({ children, tone = "neutral" }: { children: ReactNode; tone?: keyof typeof badgeTone }) {
  return (
    <span className={`inline-flex items-center rounded-full px-2 py-0.5 text-[11px] font-medium ${badgeTone[tone]}`}>
      {children}
    </span>
  );
}

export function StatusBadge({ status }: { status: "upcoming" | "invoiced" | "paid" | "received" }) {
  const tone = status === "paid" || status === "received" ? "good" : status === "invoiced" ? "accent" : "neutral";
  return <Badge tone={tone}>{t.enums.status[status]}</Badge>;
}

export function Empty({ children = t.common.empty }: { children?: ReactNode }) {
  return <p className="card p-4 text-sm text-muted">{children}</p>;
}

export function LinkButton({ href, children, primary }: { href: string; children: ReactNode; primary?: boolean }) {
  return (
    <Link href={href} className={`btn ${primary ? "btn-primary" : ""}`}>
      {children}
    </Link>
  );
}

export function Field({ label, hint, children, className = "" }: { label: string; hint?: string; children: ReactNode; className?: string }) {
  return (
    <label className={`block ${className}`}>
      <span className="label">{label}</span>
      {children}
      {hint && <span className="mt-1 block text-xs text-muted">{hint}</span>}
    </label>
  );
}
