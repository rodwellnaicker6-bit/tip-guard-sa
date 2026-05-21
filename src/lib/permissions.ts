import type { User } from "@supabase/supabase-js";

export type AppRole = "customer" | "guard" | "merchant" | "admin";

export function isAdminRole(role: string | null | undefined): boolean {
  return role === "admin";
}

export function canAccessGuardDashboard(role: AppRole | null, hasGuardRow: boolean): boolean {
  return role === "guard" || hasGuardRow;
}

export function canAccessMerchantHub(role: AppRole | null, hasMerchantRow: boolean): boolean {
  return role === "merchant" || hasMerchantRow;
}

export function canInitiateTip(user: User | null): boolean {
  return !!user;
}

/** Rate-limit hint for Edge: client sends same shape; server enforces (see api_rate_log migration). */
export const RATE_LIMIT_ROUTES = {
  paystackInitialize: "paystack-initialize",
  payoutRequest: "request-payout",
} as const;
