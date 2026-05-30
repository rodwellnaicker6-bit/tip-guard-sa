/** Production-safe venue/merchant fetch diagnostics. */

import { devInfo } from "./prodLog";

export function logVenue(message: string, extra?: Record<string, unknown>): void {
  if (typeof console === "undefined") return;
  const payload = extra && Object.keys(extra).length > 0 ? extra : undefined;
  devInfo(`[TipGuard:venue] ${message}`, payload ?? "");
}

export function isMissingColumnError(err: { code?: string; message?: string } | null | undefined): boolean {
  if (!err) return false;
  if (err.code === "42703" || err.code === "PGRST204") return true;
  const msg = (err.message ?? "").toLowerCase();
  return msg.includes("does not exist") || msg.includes("could not find");
}
