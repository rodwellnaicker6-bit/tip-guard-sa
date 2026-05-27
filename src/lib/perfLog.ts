/** Lightweight production timing logs — no PII. Prefix: `[TipGuard:perf]`. */

export function perfLog(label: string, ms: number, extra?: Record<string, unknown>): void {
  if (typeof console === "undefined") return;
  const payload =
    extra && Object.keys(extra).length > 0 ? { ms, ...extra } : { ms };
  console.info(`[TipGuard:perf] ${label}`, payload);
}

export function perfMark(label: string): () => void {
  const t0 = performance.now();
  return () => perfLog(label, Math.round(performance.now() - t0));
}
