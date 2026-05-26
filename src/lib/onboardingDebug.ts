/** Production-safe onboarding diagnostics (`[TipGuard:onboarding]` prefix). */

export const ONBOARDING_OP_TIMEOUT_MS = 10_000;
export const ONBOARDING_FAILSAFE_MS = 11_000;

export function logOnboarding(message: string, extra?: Record<string, unknown>): void {
  if (typeof console === "undefined") return;
  const payload = extra && Object.keys(extra).length > 0 ? extra : undefined;
  console.info(`[TipGuard:onboarding] ${message}`, payload ?? "");
}

export async function withOnboardingTimeout<T>(
  label: string,
  promise: PromiseLike<T>,
  ms: number = ONBOARDING_OP_TIMEOUT_MS,
): Promise<T> {
  const t0 = performance.now();
  logOnboarding(`${label} start`);
  try {
    const result = await Promise.race([
      Promise.resolve(promise),
      new Promise<T>((_, reject) => {
        window.setTimeout(
          () =>
            reject(
              new Error(`${label} timed out after ${Math.round(ms / 1000)}s. Check your connection and try again.`),
            ),
          ms,
        );
      }),
    ]);
    logOnboarding(`${label} end`, { ms: Math.round(performance.now() - t0) });
    return result;
  } catch (e) {
    logOnboarding(`${label} error`, {
      ms: Math.round(performance.now() - t0),
      message: e instanceof Error ? e.message : String(e),
    });
    throw e;
  }
}
