import { useId } from "react";

/** Tiny SVG sparkline — no charting library. */
export function Sparkline({ values, height = 40 }: { values: number[]; height?: number }) {
  const gid = useId().replace(/:/g, "");
  if (values.length === 0) return <div className="h-10 w-full rounded-lg bg-white/5" />;
  const w = 120;
  const h = height;
  const max = Math.max(...values, 1);
  const min = Math.min(...values, 0);
  const range = max - min || 1;
  const step = values.length > 1 ? w / (values.length - 1) : w;
  const pts = values
    .map((v, i) => {
      const x = i * step;
      const y = h - ((v - min) / range) * (h - 4) - 2;
      return `${x},${y}`;
    })
    .join(" ");
  const gradId = `spg-${gid}`;
  return (
    <svg width="100%" height={h} viewBox={`0 0 ${w} ${h}`} className="max-w-full" preserveAspectRatio="none" aria-hidden>
      <defs>
        <linearGradient id={gradId} x1="0" y1="0" x2="1" y2="0">
          <stop offset="0%" stopColor="#fbbf24" stopOpacity="0.2" />
          <stop offset="100%" stopColor="#fbbf24" stopOpacity="0.9" />
        </linearGradient>
      </defs>
      <polyline fill="none" stroke={`url(#${gradId})`} strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" points={pts} />
    </svg>
  );
}
