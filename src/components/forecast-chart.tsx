import { formatShortDate } from "@/lib/dates";
import { formatMoney, type CurrencyCode } from "@/lib/money";

type Point = { date: string; balance: number };

/** Step chart of the forecast balance. Pure SVG, rendered on the server. */
export function ForecastChart({ currency, points, low }: { currency: CurrencyCode; points: Point[]; low: Point }) {
  if (points.length < 2) return null;
  const W = 640;
  const H = 180;
  const pad = { l: 8, r: 8, t: 16, b: 22 };
  const values = points.map((p) => p.balance);
  const min = Math.min(0, ...values);
  const max = Math.max(0, ...values);
  const span = max - min || 1;
  const x = (i: number) => pad.l + (i / (points.length - 1)) * (W - pad.l - pad.r);
  const y = (v: number) => pad.t + (1 - (v - min) / span) * (H - pad.t - pad.b);

  let d = `M ${x(0)} ${y(points[0].balance)}`;
  for (let i = 1; i < points.length; i++) d += ` H ${x(i)} V ${y(points[i].balance)}`;
  const area = `${d} V ${y(min)} H ${x(0)} Z`;
  const lowIndex = points.findIndex((p) => p.date === low.date);
  const last = points[points.length - 1];

  return (
    <figure className="card p-3">
      <svg viewBox={`0 0 ${W} ${H}`} className="h-44 w-full" preserveAspectRatio="none" role="img" aria-label={`${currency} forecast`}>
        <path d={area} fill="var(--accent)" opacity="0.08" />
        {min < 0 && <line x1={pad.l} x2={W - pad.r} y1={y(0)} y2={y(0)} stroke="var(--out)" strokeDasharray="4 4" strokeWidth="1" vectorEffect="non-scaling-stroke" />}
        <path d={d} fill="none" stroke="var(--accent)" strokeWidth="2" vectorEffect="non-scaling-stroke" />
        {lowIndex >= 0 && <circle cx={x(lowIndex)} cy={y(low.balance)} r="4" fill={low.balance < 0 ? "var(--out)" : "var(--warn)"} />}
      </svg>
      <figcaption className="mt-1 flex justify-between text-xs text-muted">
        <span>{formatShortDate(points[0].date)} · {formatMoney(points[0].balance, currency)}</span>
        <span className="font-medium text-fg">{currency}</span>
        <span>{formatShortDate(last.date)} · {formatMoney(last.balance, currency)}</span>
      </figcaption>
    </figure>
  );
}
