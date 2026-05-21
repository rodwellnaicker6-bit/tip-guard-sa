/** Admin MFA scaffolding — full Supabase TOTP enrollment is post-MVP. */

export type MfaFactorStatus = "unverified" | "verified";

export type AdminMfaFactor = {
  id: string;
  factorType: "totp" | "phone";
  friendlyName?: string;
  status: MfaFactorStatus;
};

export type AdminMfaSettings = {
  /** When true, operators should block admin routes without verified TOTP (enforce server-side post-MVP). */
  requireTotpForAdmin: boolean;
  factors: AdminMfaFactor[];
  enrolledAt?: string;
};

export const DEFAULT_ADMIN_MFA_SETTINGS: AdminMfaSettings = {
  requireTotpForAdmin: false,
  factors: [],
};
