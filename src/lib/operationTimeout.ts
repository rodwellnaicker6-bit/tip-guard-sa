import { devInfo } from "./prodLog";
import { recordPerf } from "./perfTelemetry";
import { requestQueue } from "./requestQueue";

/** Shared timeouts for payment, QR, payout, venue, RPC, and dashboard flows. */

export type FlowScope = "qr" | "pay" | "payout" | "venue" | "rpc" | "dashboard";

export const QR_RESOLVE_TIMEOUT_MS = 8_000;
export const PAYMENT_SESSION_TIMEOUT_MS = 10_000;
export const PAYMENT_INIT_TIMEOUT_MS = 15_000;
export const PAYOUT_REQUEST_TIMEOUT_MS = 15_000;
export const CHECKOUT_UI_TIMEOUT_MS = 18_000;
export const VENUE_LOAD_TIMEOUT_MS = 12_000;
export const RPC_DEFAULT_TIMEOUT_MS = 12_000;
export const DASHBOARD_LOAD_TIMEOUT_MS = 15_000;
export const PAYMENT_VERIFY_TIMEOUT_MS = 12_000;

export function logFlow(scope: FlowScope, message: string, extra?: Record<string, unknown>): void {
  if (typeof console === "undefined") return;
  const payload = extra && Object.keys(extra).length > 0 ? extra : undefined;
  devInfo(`[TipGuard:${scope}] ${message}`, payload ?? "");
}

export type OperationInput<T> = PromiseLike<T> | ((signal: AbortSignal) => PromiseLike<T>);

export async function withOperationTimeout<T>(
  scope: FlowScope,
  label: string,
  input: OperationInput<T>,
  ms: number,
  parentSignal?: AbortSignal,
  options?: { queued?: boolean },
): Promise<T> {
  const runQueued = options?.queued !== false;
  const execute = async () => {
    const t0 = performance.now();
    const controller = new AbortController();
    const onParentAbort = () => controller.abort();
    if (parentSignal?.aborted) controller.abort();
    else parentSignal?.addEventListener("abort", onParentAbort, { once: true });

    const timer = window.setTimeout(() => controller.abort(), ms);
    logFlow(scope, `${label} start`);

    const run = (): PromiseLike<T> =>
      typeof input === "function" ? input(controller.signal) : input;

    try {
      const result = await Promise.race([
        Promise.resolve(run()),
        new Promise<T>((_, reject) => {
          if (controller.signal.aborted) {
            reject(
              new Error(
                `${label} timed out after ${Math.round(ms / 1000)}s. Check your connection and try again.`,
              ),
            );
            return;
          }
          controller.signal.addEventListener(
            "abort",
            () => {
              reject(
                new Error(
                  `${label} timed out after ${Math.round(ms / 1000)}s. Check your connection and try again.`,
                ),
              );
            },
            { once: true },
          );
        }),
      ]);
      const elapsed = Math.round(performance.now() - t0);
      logFlow(scope, `${label} end`, { ms: elapsed });
      recordPerf(`${scope}:${label}`, elapsed);
      return result;
    } catch (e) {
      const elapsed = Math.round(performance.now() - t0);
      logFlow(scope, `${label} error`, {
        ms: elapsed,
        message: e instanceof Error ? e.message : String(e),
      });
      recordPerf(`${scope}:${label}:error`, elapsed);
      throw e;
    } finally {
      window.clearTimeout(timer);
      parentSignal?.removeEventListener("abort", onParentAbort);
    }
  };
  return runQueued ? requestQueue.run(execute) : execute();
}
