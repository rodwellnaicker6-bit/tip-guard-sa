/**
 * Boot-time logging: verbose in dev or VITE_DEBUG_BOOT=true; prod-safe one-liners always.
 */
import { isPaystackConfigured } from "./paystackEnv";
import { devInfo } from "./prodLog";

export const isBootDebug =
  import.meta.env.DEV || import.meta.env.VITE_DEBUG_BOOT === "true";

/** Temporary production diagnostics strip until startup is stable (also when VITE_DEBUG_BOOT=true). */
export const showBootBanner = import.meta.env.PROD || isBootDebug;

function supabaseHealthLabel(): "connected" | "disabled" {
  const url = import.meta.env.VITE_SUPABASE_URL?.trim();
  const anon = import.meta.env.VITE_SUPABASE_ANON_KEY?.trim();
  return url && anon ? "connected" : "disabled";
}

export function bootLog(tag: string, ...args: unknown[]): void {
  if (isBootDebug) devInfo(`[TipGuard:boot] ${tag}`, ...args);
}

/** Logs presence of VITE_* keys only — never values. */
export function logRuntimeEnvPresence(): void {
  if (!isBootDebug) return;
  devInfo("[TipGuard:boot] env presence", {
    VITE_SUPABASE_URL: Boolean(import.meta.env.VITE_SUPABASE_URL?.trim()),
    VITE_SUPABASE_ANON_KEY: Boolean(import.meta.env.VITE_SUPABASE_ANON_KEY?.trim()),
    VITE_PAYSTACK_PUBLIC_KEY: Boolean(import.meta.env.VITE_PAYSTACK_PUBLIC_KEY?.trim()),
    VITE_PAYSTACK_TEST_MODE: Boolean(import.meta.env.VITE_PAYSTACK_TEST_MODE?.trim()),
  });
}

/** Single-line startup health summary — always logged in production; extra detail when boot debug is on. */
export function logBootHealth(phase: string, extra?: Record<string, unknown>): void {
  const supabase = supabaseHealthLabel();
  const payments = isPaystackConfigured() ? "enabled" : "disabled";
  const suffix = extra && Object.keys(extra).length > 0 ? ` ${JSON.stringify(extra)}` : "";
  devInfo(`[TipGuard] ${phase} · supabase=${supabase} · payments=${payments}${suffix}`);
}
