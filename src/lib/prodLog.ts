/** Gate verbose console output in production (errors/warnings always allowed). */

export const LOG_VERBOSE =
  import.meta.env.DEV || import.meta.env.VITE_TIPGUARD_VERBOSE === "true";

export const LOG_PERF =
  import.meta.env.DEV ||
  import.meta.env.VITE_TIPGUARD_PERF === "true" ||
  import.meta.env.VITE_TIPGUARD_VERBOSE === "true";

export function devInfo(...args: unknown[]): void {
  if (LOG_VERBOSE && typeof console !== "undefined") console.info(...args);
}

export function devWarn(...args: unknown[]): void {
  if (LOG_VERBOSE && typeof console !== "undefined") console.warn(...args);
}

export function prodWarn(...args: unknown[]): void {
  if (typeof console !== "undefined") console.warn(...args);
}

export function prodError(...args: unknown[]): void {
  if (typeof console !== "undefined") console.error(...args);
}
