import { useContext } from "react";
import { AuthContext } from "./authReactContext";
import type { AuthContextValue } from "./authTypes";

const SAFE_AUTH_FALLBACK: AuthContextValue = {
  user: null,
  session: null,
  role: null,
  profileFields: { full_name: null, phone: null },
  hasGuardRow: false,
  hasMerchantRow: false,
  isGuardUser: false,
  isMerchantUser: false,
  sessionReady: true,
  profileReady: true,
  authReady: true,
  loading: false,
  authBootError: null,
  signIn: async () => ({ error: "Auth is still starting. Reload and try again." }),
  signUp: async () => ({ error: "Auth is still starting. Reload and try again." }),
  resendSignupEmail: async () => ({ error: "Auth is still starting." }),
  signInWithPhoneOtp: async () => ({ error: "Auth is still starting." }),
  verifyPhoneOtp: async () => ({ error: "Auth is still starting." }),
  signInMagicLink: async () => ({ error: "Auth is still starting." }),
  resetPasswordForEmail: async () => ({ error: "Auth is still starting." }),
  updatePassword: async () => ({ error: "Auth is still starting." }),
  signOut: async () => {},
  refreshProfile: async () => null,
};

/** Consumer hook — returns safe fallback instead of throwing during emergency stability. */
export function useAuth(): AuthContextValue {
  const ctx = useContext(AuthContext);
  if (ctx === undefined) {
    console.warn("[TipGuard] useAuth called outside AuthProvider — using safe fallback");
    return SAFE_AUTH_FALLBACK;
  }
  return ctx;
}
