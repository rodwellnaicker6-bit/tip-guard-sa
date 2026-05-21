/** Paystack env safety — client must only see VITE_PAYSTACK_PUBLIC_KEY (never secret). */

const PK_PATTERN = /^pk_(test|live)_[a-zA-Z0-9]+$/;

export function getPaystackPublicKey(): string {
  return import.meta.env.VITE_PAYSTACK_PUBLIC_KEY?.trim() ?? "";
}

/** Validates public key shape; does not prove the key is active in Paystack. */
export function validatePaystackPublicKey(pk: string): string | null {
  if (!pk) return "VITE_PAYSTACK_PUBLIC_KEY is not set — checkout is disabled.";
  if (pk.startsWith("sk_")) return "Secret Paystack key must not be used in the browser (use pk_* public key).";
  if (!PK_PATTERN.test(pk)) return "VITE_PAYSTACK_PUBLIC_KEY format is invalid (expected pk_test_* or pk_live_*).";
  return null;
}

export function isPaystackConfigured(): boolean {
  return validatePaystackPublicKey(getPaystackPublicKey()) === null;
}

export function isPaystackTestMode(): boolean {
  const forced = import.meta.env.VITE_PAYSTACK_TEST_MODE;
  if (forced === "true") return true;
  if (forced === "false") return false;
  return getPaystackPublicKey().startsWith("pk_test_");
}

/** Warn operators if live keys appear on non-production hostnames. */
export function paystackEnvIssue(): string | null {
  const pk = getPaystackPublicKey();
  const formatErr = validatePaystackPublicKey(pk);
  if (formatErr) return formatErr;
  if (pk.startsWith("pk_live_") && import.meta.env.DEV) {
    return "Live Paystack public key detected in dev build — use pk_test_ for local/staging.";
  }
  if (import.meta.env.PROD && pk.startsWith("pk_test_")) {
    return null;
  }
  return null;
}
