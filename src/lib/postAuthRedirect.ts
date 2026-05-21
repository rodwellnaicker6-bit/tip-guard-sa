import { isProfileComplete, type ProfileCompletionFields } from "./profileCompletion";

/** Central place for default navigation after sign-in (keep in sync with `Login` post-submit logic). */
export function pathAfterSignIn(
  profileRole: string | null | undefined,
  hasGuardRow: boolean,
  hasMerchantRow: boolean,
  profileFields?: ProfileCompletionFields | null,
): string {
  if (profileFields && !isProfileComplete(profileFields)) {
    return "/onboarding";
  }
  if (!profileRole) {
    return "/onboarding";
  }
  if (profileRole === "admin") return "/admin";
  if (profileRole === "guard" || hasGuardRow) return "/guard";
  if (profileRole === "merchant" || hasMerchantRow) return "/merchant";
  return "/customer/dashboard";
}
