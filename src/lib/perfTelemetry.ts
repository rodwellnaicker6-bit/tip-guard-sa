import { LOG_PERF, devInfo } from "./prodLog";

type PerfSample = { label: string; ms: number; at: number };

const MAX_SAMPLES = 200;
const samples: PerfSample[] = [];

export function recordPerf(label: string, ms: number, extra?: Record<string, unknown>): void {
  samples.push({ label, ms, at: Date.now() });
  if (samples.length > MAX_SAMPLES) samples.shift();
  if (LOG_PERF) {
    const payload = extra && Object.keys(extra).length > 0 ? { ms, ...extra } : { ms };
    devInfo(`[TipGuard:perf] ${label}`, payload);
  }
}

export function perfMark(label: string): () => void {
  const t0 = performance.now();
  return () => recordPerf(label, Math.round(performance.now() - t0));
}

function percentile(sorted: number[], p: number): number {
  if (sorted.length === 0) return 0;
  return sorted[Math.min(sorted.length - 1, Math.floor(sorted.length * p))] ?? 0;
}

export function getPerfSnapshot(): {
  count: number;
  p50: number;
  p95: number;
  max: number;
  byLabel: Record<string, { count: number; p50: number; p95: number }>;
} {
  const ms = samples.map((s) => s.ms).sort((a, b) => a - b);
  const byLabel: Record<string, number[]> = {};
  for (const s of samples) {
    (byLabel[s.label] ??= []).push(s.ms);
  }
  const byLabelStats: Record<string, { count: number; p50: number; p95: number }> = {};
  for (const [label, vals] of Object.entries(byLabel)) {
    const sorted = [...vals].sort((a, b) => a - b);
    byLabelStats[label] = {
      count: sorted.length,
      p50: percentile(sorted, 0.5),
      p95: percentile(sorted, 0.95),
    };
  }
  return {
    count: samples.length,
    p50: percentile(ms, 0.5),
    p95: percentile(ms, 0.95),
    max: ms[ms.length - 1] ?? 0,
    byLabel: byLabelStats,
  };
}

/** Exposed for soak scripts / devtools — no PII. */
export function attachPerfTelemetryGlobal(): void {
  if (typeof window === "undefined") return;
  (window as Window & { __TIPGUARD_PERF__?: typeof getPerfSnapshot }).__TIPGUARD_PERF__ = getPerfSnapshot;
}
