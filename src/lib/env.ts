import { isPaystackTestMode } from "./paystackMode";
import { validatePaystackPublicKey } from "./paystackEnv";

export type ClientEnvValidation =
  | { ok: true }
  | { ok: false; message: string; missing: string[] };

/** Validates Vite public env. Never throws — callers render {@link ClientEnvError} or degrade gracefully. */
export function validateClientEnv(): ClientEnvValidation {
  const prod = import.meta.env.PROD;
  const url = import.meta.env.VITE_SUPABASE_URL?.trim();
  const anon = import.meta.env.VITE_SUPABASE_ANON_KEY?.trim();
  const paystackPk = import.meta.env.VITE_PAYSTACK_PUBLIC_KEY?.trim();
  const testModeRaw = import.meta.env.VITE_PAYSTACK_TEST_MODE?.trim();

  if (!prod) {
    if (!url || !anon) {
      console.warn("TipGuard (dev): VITE_SUPABASE_URL / VITE_SUPABASE_ANON_KEY missing — auth and data may not work.");
    }
    if (!paystackPk) {
      console.warn("TipGuard (dev): VITE_PAYSTACK_PUBLIC_KEY missing — Paystack checkout will not open.");
    }
    if (testModeRaw && !["true", "false", "1", "0", "yes", "no"].includes(testModeRaw.toLowerCase())) {
      console.warn("TipGuard (dev): VITE_PAYSTACK_TEST_MODE should be true/false (optional); deriving from public key.");
    }
    return { ok: true };
  }

  if (url && /127\.0\.0\.1|localhost/.test(url)) {
    console.warn(
      "TipGuard (prod): VITE_SUPABASE_URL points at localhost — email magic links and OAuth redirects will not work for real users.",
    );
  }

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
  const pkErr = validatePaystackPublicKey(paystackPk);
  if (pkErr) {
    return { ok: false, message: pkErr, missing: ["VITE_PAYSTACK_PUBLIC_KEY"] };
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
