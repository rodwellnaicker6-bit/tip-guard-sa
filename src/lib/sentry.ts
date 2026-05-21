/**
 * Sentry init stub — enable by setting VITE_SENTRY_DSN in production.
 * Post-MVP: add @sentry/react and wire ErrorBoundary captureException.
 */
export function initSentry(): void {
  const dsn = import.meta.env.VITE_SENTRY_DSN?.trim();
  if (!dsn) return;
  if (import.meta.env.DEV) {
    console.info("[TipGuard] VITE_SENTRY_DSN is set; add @sentry/react to capture errors.");
  }
}
