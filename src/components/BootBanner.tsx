import { getClientEnvSummary } from "../lib/env";
import { isBootDebug, showBootBanner } from "../lib/bootDebug";
import { didSupabaseInitFail, getSupabaseInitError } from "../lib/supabase";
import { useAuth } from "../context/useAuth";

/**
 * Temporary production diagnostics strip — remove or gate behind VITE_DEBUG_BOOT once stable.
 */
export function BootBanner() {
  const { authBootError, authReady } = useAuth();

  if (!showBootBanner) return null;

  const env = getClientEnvSummary();
  const issues: string[] = [];

  if (!env.supabaseConfigured) issues.push("Supabase env missing");
  if (didSupabaseInitFail()) {
    issues.push(`Supabase init failed${getSupabaseInitError() ? `: ${getSupabaseInitError()}` : ""}`);
  }
  if (!env.paystackConfigured) issues.push("Payments unavailable");
  if (authBootError) issues.push(`Auth: ${authBootError}`);
  if (!authReady && isBootDebug) issues.push("Auth still loading");

  if (issues.length === 0 && !isBootDebug) return null;

  return (
    <div
      role="status"
      className="boot-banner border-b border-amber-500/30 bg-amber-950/80 px-3 py-2 text-center text-[11px] leading-snug text-amber-100/90"
    >
      <span className="font-semibold text-amber-300">TipGuard boot</span>
      {" · "}
      Supabase {env.supabaseConfigured ? "ok" : "off"}
      {" · "}
      Payments {env.paystackConfigured ? (env.paystackTestMode ? "test" : "live") : "off"}
      {authReady ? " · Auth ready" : ""}
      {issues.length > 0 ? (
        <span className="block mt-0.5 text-amber-200/80">{issues.join(" · ")}</span>
      ) : null}
    </div>
  );
}
