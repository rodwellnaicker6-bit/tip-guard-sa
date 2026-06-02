/** Paystack and TipGuard success URLs may use different reference query keys. */
export function resolvePaymentReference(
  params: URLSearchParams | { get: (key: string) => string | null },
): string | null {
  for (const key of ["ref", "reference", "trxref"] as const) {
    const raw = params.get(key)?.trim();
    if (raw) return raw;
  }
  return null;
}

/** Mobile and in-app browsers often need full-page hosted checkout (callback_url redirect). */
export function preferHostedPaystackCheckout(): boolean {
  if (typeof window === "undefined") return false;
  const ua = navigator.userAgent;
  const mobileUa = /iPhone|iPad|iPod|Android|webOS|BlackBerry|IEMobile|Opera Mini/i.test(ua);
  const coarseMobile =
    typeof window.matchMedia === "function" &&
    window.matchMedia("(max-width: 768px)").matches;
  const standalone =
    typeof window.matchMedia === "function" &&
    window.matchMedia("(display-mode: standalone)").matches;
  return mobileUa || coarseMobile || standalone;
}
