/**
 * Canonical operator contact for production (Paystack / POPIA).
 * Override via VITE_* env on Vercel without redeploying copy changes.
 */
export const OPERATOR_CONTACT = {
  legalName: "TipGuard SA (Pty) Ltd",
  supportEmail: "support@tipguardsa.co.za",
  phone: "+27 10 880 4590",
  /** Customer support mobile (also shown on Terms & Contact). */
  phoneMobile: "062 713 5401",
  address: "235 Queen Mary Avenue, Durban, KwaZulu-Natal, South Africa",
} as const;
