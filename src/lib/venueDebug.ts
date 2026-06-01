/** Production-safe venue/merchant fetch diagnostics. */

import { devInfo } from "./prodLog";

const LOG_VENUE_TRACE =
  import.meta.env.DEV ||
  import.meta.env.VITE_DEBUG_VENUE === "true" ||
  import.meta.env.VITE_DEBUG_VENUE === "1" ||
  import.meta.env.VITE_TIPGUARD_VERBOSE === "true";

export function logVenue(message: string, extra?: Record<string, unknown>): void {
  if (typeof console === "undefined") return;
  const payload = extra && Object.keys(extra).length > 0 ? extra : undefined;
  if (LOG_VENUE_TRACE) {
    console.info(`[TipGuard:venue] ${message}`, payload ?? "");
    return;
  }
  devInfo(`[TipGuard:venue] ${message}`, payload ?? "");
}

/** Always logged — timeouts and watchdogs in production. */
export function logVenueWarn(message: string, extra?: Record<string, unknown>): void {
  if (typeof console === "undefined") return;
  const payload = extra && Object.keys(extra).length > 0 ? extra : undefined;
  console.warn(`[TipGuard:venue] ${message}`, payload ?? "");
}

export function isMissingColumnError(err: { code?: string; message?: string } | null | undefined): boolean {
  if (!err) return false;
  if (err.code === "42703" || err.code === "PGRST204") return true;
  const msg = (err.message ?? "").toLowerCase();
  return msg.includes("does not exist") || msg.includes("could not find");
}
