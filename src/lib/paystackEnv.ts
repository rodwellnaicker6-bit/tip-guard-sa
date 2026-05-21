/** Paystack env safety — client must only see VITE_PAYSTACK_PUBLIC_KEY (never secret). */

const PK_PATTERN = /^pk_(test|live)_[a-zA-Z0-9]+$/;

/** When true, invalid keys surface as errors to callers; otherwise warn-only. */
export const PAYSTACK_ENV_STRICT = false;

export function getPaystackPublicKey(): string {
  return import.meta.env.VITE_PAYSTACK_PUBLIC_KEY?.trim() ?? "";
}

/** Validates public key shape; does not prove the key is active in Paystack. Warn-only unless strict. */
export function validatePaystackPublicKey(pk: string): string | null {
  if (!pk) {
    console.error("TipGuard: VITE_PAYSTACK_PUBLIC_KEY is not set — checkout is disabled.");
    return PAYSTACK_ENV_STRICT ? "VITE_PAYSTACK_PUBLIC_KEY is not set — checkout is disabled." : null;
  }
  if (pk.startsWith("sk_")) {
    console.error("TipGuard: Secret Paystack key must not be used in the browser (use pk_* public key).");
    return PAYSTACK_ENV_STRICT
      ? "Secret Paystack key must not be used in the browser (use pk_* public key)."
      : null;
  }
  if (!PK_PATTERN.test(pk)) {
    console.error("TipGuard: VITE_PAYSTACK_PUBLIC_KEY format is invalid (expected pk_test_* or pk_live_*).");
    return PAYSTACK_ENV_STRICT
      ? "VITE_PAYSTACK_PUBLIC_KEY format is invalid (expected pk_test_* or pk_live_*)."
      : null;
  }
  return null;
}

export function isPaystackConfigured(): boolean {
  return Boolean(getPaystackPublicKey().trim());
}

export function isPaystackTestMode(): boolean {
  const forced = import.meta.env.VITE_PAYSTACK_TEST_MODE;
  if (forced === "true") return true;
  if (forced === "false") return false;
  return getPaystackPublicKey().startsWith("pk_test_");
}

/** Warn operators if live keys appear on non-production hostnames. Never throws. */
export function paystackEnvIssue(): string | null {
  const pk = getPaystackPublicKey();
  if (!pk.trim()) return PAYSTACK_ENV_STRICT ? "VITE_PAYSTACK_PUBLIC_KEY is not set" : null;
  const formatErr = validatePaystackPublicKey(pk);
  if (formatErr) return PAYSTACK_ENV_STRICT ? formatErr : null;
  if (pk.startsWith("pk_live_") && import.meta.env.DEV) {
    console.error("TipGuard: Live Paystack public key detected in dev build — use pk_test_ for local/staging.");
    return PAYSTACK_ENV_STRICT
      ? "Live Paystack public key detected in dev build — use pk_test_ for local/staging."
      : null;
  }
  return null;
}
