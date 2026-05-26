/** Shared timeouts for payment, QR, payout, and venue flows. */

export const QR_RESOLVE_TIMEOUT_MS = 12_000;
export const PAYMENT_SESSION_TIMEOUT_MS = 10_000;
export const PAYMENT_INIT_TIMEOUT_MS = 15_000;
export const PAYOUT_REQUEST_TIMEOUT_MS = 15_000;
export const CHECKOUT_UI_TIMEOUT_MS = 18_000;

export function logFlow(scope: "qr" | "pay" | "payout" | "venue", message: string, extra?: Record<string, unknown>): void {
  if (typeof console === "undefined") return;
  const payload = extra && Object.keys(extra).length > 0 ? extra : undefined;
  console.info(`[TipGuard:${scope}] ${message}`, payload ?? "");
}

export async function withOperationTimeout<T>(
  scope: "qr" | "pay" | "payout" | "venue",
  label: string,
  promise: PromiseLike<T>,
  ms: number,
): Promise<T> {
  const t0 = performance.now();
  logFlow(scope, `${label} start`);
  try {
    const result = await Promise.race([
      Promise.resolve(promise),
      new Promise<T>((_, reject) => {
        window.setTimeout(
          () => reject(new Error(`${label} timed out after ${Math.round(ms / 1000)}s. Check your connection and try again.`)),
          ms,
        );
      }),
    ]);
    logFlow(scope, `${label} end`, { ms: Math.round(performance.now() - t0) });
    return result;
  } catch (e) {
    logFlow(scope, `${label} error`, {
      ms: Math.round(performance.now() - t0),
      message: e instanceof Error ? e.message : String(e),
    });
    throw e;
  }
}
