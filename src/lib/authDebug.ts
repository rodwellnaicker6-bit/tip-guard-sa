/** Auth diagnostics — grep `[TipGuard:auth]` when verbose logging enabled. */

import { devInfo, prodWarn } from "./prodLog";

export function logAuth(message: string, extra?: Record<string, unknown>): void {
  if (typeof console === "undefined") return;
  const payload = extra && Object.keys(extra).length > 0 ? extra : undefined;
  devInfo(`[TipGuard:auth] ${message}`, payload ?? "");
}

/** Logged when the app sends the user to login or clears session (not manual sign-out). */
export function logAuthKickout(reason: string, source: string, extra?: Record<string, unknown>): void {
  prodWarn(`[TipGuard:auth] kick-out: ${reason}`, { source, ...extra });
}
