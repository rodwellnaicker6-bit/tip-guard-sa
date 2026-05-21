/** Paystack env safety — client must only see VITE_PAYSTACK_PUBLIC_KEY (never secret). */

export function getPaystackPublicKey(): string {
  return import.meta.env.VITE_PAYSTACK_PUBLIC_KEY?.trim() ?? "";
}

export function isPaystackConfigured(): boolean {
  return getPaystackPublicKey().length > 0;
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
  if (!pk) return "VITE_PAYSTACK_PUBLIC_KEY is not set — checkout is disabled.";
  if (pk.startsWith("pk_live_") && import.meta.env.DEV) {
    return "Live Paystack public key detected in dev build — use pk_test_ for local/staging.";
  }
  if (import.meta.env.PROD && pk.startsWith("pk_test_")) {
    return null;
  }
  return null;
}
