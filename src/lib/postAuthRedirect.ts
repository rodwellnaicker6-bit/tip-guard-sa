/** Central place for default navigation after sign-in (keep in sync with `Login` post-submit logic). */
export function pathAfterSignIn(
  profileRole: string | null | undefined,
  hasGuardRow: boolean,
  hasMerchantRow: boolean,
): string {
  if (profileRole === "admin") return "/admin";
  if (profileRole === "guard" || hasGuardRow) return "/guard";
  if (profileRole === "merchant" || hasMerchantRow) return "/merchant";
  return "/customer/dashboard";
}
