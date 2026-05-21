import { isPaystackTestMode } from "./paystackMode";
import { validatePaystackPublicKey } from "./paystackEnv";

export type ClientEnvValidation =
  | { ok: true }
  | { ok: false; message: string; missing: string[] };

/**
 * Validates Vite public env. Never throws and never blocks render (warn-only).
 * Re-enable hard fail via {@link CLIENT_ENV_STRICT} when env is stable in deploy.
 */
export const CLIENT_ENV_STRICT = false;

/** Validates Vite public env. Never throws — logs issues and always allows the app to mount. */
export function validateClientEnv(): ClientEnvValidation {
  const prod = import.meta.env.PROD;
  const url = import.meta.env.VITE_SUPABASE_URL?.trim();
  const anon = import.meta.env.VITE_SUPABASE_ANON_KEY?.trim();
  const paystackPk = import.meta.env.VITE_PAYSTACK_PUBLIC_KEY?.trim();
  const testModeRaw = import.meta.env.VITE_PAYSTACK_TEST_MODE?.trim();

  const warnings: string[] = [];

  if (!url) warnings.push("VITE_SUPABASE_URL is not set");
  if (!anon) warnings.push("VITE_SUPABASE_ANON_KEY is not set");
  if (!paystackPk) warnings.push("VITE_PAYSTACK_PUBLIC_KEY is not set");

  if (testModeRaw && !["true", "false", "1", "0", "yes", "no"].includes(testModeRaw.toLowerCase())) {
    warnings.push("VITE_PAYSTACK_TEST_MODE should be true/false (optional); deriving from public key");
  }

  if (url && /127\.0\.0\.1|localhost/.test(url) && prod) {
    warnings.push("VITE_SUPABASE_URL points at localhost — magic links and OAuth redirects will not work for real users");
  }

  const pkErr = paystackPk ? validatePaystackPublicKey(paystackPk) : "VITE_PAYSTACK_PUBLIC_KEY is not set";
  if (pkErr) warnings.push(pkErr);

  if (warnings.length > 0) {
    const prefix = prod ? "TipGuard (prod)" : "TipGuard (dev)";
    console.error(`${prefix}: env configuration issues — app renders with limited features:`, warnings);
  }

  if (CLIENT_ENV_STRICT && prod) {
    const missing: string[] = [];
    if (!url) missing.push("VITE_SUPABASE_URL");
    if (!anon) missing.push("VITE_SUPABASE_ANON_KEY");
    if (!paystackPk) missing.push("VITE_PAYSTACK_PUBLIC_KEY");
    if (missing.length > 0) {
      return {
        ok: false,
        message: `Missing required production env: ${missing.join(", ")}`,
        missing,
      };
    }
    if (pkErr) {
      return { ok: false, message: pkErr, missing: ["VITE_PAYSTACK_PUBLIC_KEY"] };
    }
  }

  return { ok: true };
}

/** Human-readable env summary for support / settings (no secrets). */
export function getClientEnvSummary(): { supabaseConfigured: boolean; paystackConfigured: boolean; paystackTestMode: boolean } {
  return {
    supabaseConfigured: Boolean(import.meta.env.VITE_SUPABASE_URL?.trim() && import.meta.env.VITE_SUPABASE_ANON_KEY?.trim()),
    paystackConfigured: Boolean(import.meta.env.VITE_PAYSTACK_PUBLIC_KEY?.trim()),
    paystackTestMode: isPaystackTestMode(),
  };
}
