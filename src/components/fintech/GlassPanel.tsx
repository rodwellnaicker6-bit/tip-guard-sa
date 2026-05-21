import type { ReactNode } from "react";

/** Glass surface + subtle gradient border (fintech shell). */
export function GlassPanel({
  children,
  className = "",
  glow = "amber",
}: {
  children: ReactNode;
  className?: string;
  glow?: "amber" | "emerald" | "slate";
}) {
  const glowCls =
    glow === "emerald"
      ? "shadow-[0_0_60px_-12px_rgba(16,185,129,0.35)]"
      : glow === "slate"
        ? "shadow-[0_0_40px_-12px_rgba(148,163,184,0.25)]"
        : "shadow-[0_0_60px_-12px_rgba(245,158,11,0.35)]";
  return (
    <div
      className={`relative min-w-0 overflow-hidden rounded-3xl border border-white/14 bg-gradient-to-br from-white/[0.11] to-white/[0.04] p-5 backdrop-blur-xl ${glowCls} ${className}`}
    >
      <div className="pointer-events-none absolute inset-0 bg-gradient-to-br from-white/[0.1] via-transparent to-transparent" />
      <div className="pointer-events-none absolute -inset-px rounded-[inherit] opacity-60 shadow-[inset_0_1px_0_rgba(255,255,255,0.12)]" />
      <div className="relative z-10 min-w-0">{children}</div>
    </div>
  );
}
