import type { ReactNode } from "react";

export function TrustRibbon({ children }: { children?: ReactNode }) {
  return (
    <div className="flex flex-wrap items-center justify-center gap-3 rounded-2xl border border-emerald-500/20 bg-emerald-500/[0.07] px-4 py-3 text-[11px] font-semibold uppercase tracking-[0.12em] text-emerald-200/90">
      <span className="inline-flex items-center gap-1.5">
        <span className="h-2 w-2 animate-pulse rounded-full bg-emerald-400" aria-hidden />
        TLS · ZAR
      </span>
      <span className="text-white/20">|</span>
      <span>PCI via gateway</span>
      <span className="text-white/20">|</span>
      <span>Fraud monitored</span>
      {children}
    </div>
  );
}
