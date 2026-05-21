/**
 * Sentry — initialized only when VITE_SENTRY_DSN is set. Never throws on missing DSN or load failure.
 */

let sentryReady = false;

export function captureException(error: unknown, context?: Record<string, unknown>): void {
  if (!sentryReady) return;
  void import("@sentry/react")
    .then((Sentry) => {
      Sentry.captureException(error, context ? { extra: context } : undefined);
    })
    .catch(() => {
      /* ignore */
    });
}

export function initSentry(): void {
  const dsn = import.meta.env.VITE_SENTRY_DSN?.trim();
  if (!dsn) return;

  void import("@sentry/react")
    .then((Sentry) => {
      Sentry.init({
        dsn,
        environment: import.meta.env.MODE,
        enabled: !import.meta.env.DEV,
        tracesSampleRate: 0.1,
      });
      sentryReady = true;
      if (import.meta.env.DEV) {
        console.info("[TipGuard] Sentry initialized (events disabled in dev)");
      }
    })
    .catch((e) => {
      console.error("[TipGuard] Sentry init failed", e);
    });
}
