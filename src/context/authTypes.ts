import type { Session, User } from "@supabase/supabase-js";

export type AuthRole = "guard" | "customer" | "admin" | "merchant" | null;

export type AuthContextValue = {
  user: User | null;
  session: Session | null;
  role: AuthRole;
  /** True when the user has a `guards` row (signup may force profile role to customer). */
  hasGuardRow: boolean;
  /** Merchant business row (profile may be promoted to merchant by admin). */
  hasMerchantRow: boolean;
  /** Use for dashboard entry: guard table row or explicit guard profile role. */
  isGuardUser: boolean;
  /** Profile role merchant or merchants row. */
  isMerchantUser: boolean;
  loading: boolean;
  signIn: (email: string, password: string) => Promise<{ error?: string }>;
  signUp: (
    email: string,
    password: string,
    fullName: string,
    role: Exclude<AuthRole, null>,
  ) => Promise<{ error?: string; needsEmailVerification?: boolean }>;
  resendSignupEmail: (email: string) => Promise<{ error?: string }>;
  signInWithPhoneOtp: (phone: string) => Promise<{ error?: string }>;
  verifyPhoneOtp: (phone: string, token: string) => Promise<{ error?: string }>;
  signInMagicLink: (email: string) => Promise<{ error?: string }>;
  resetPasswordForEmail: (email: string) => Promise<{ error?: string }>;
  updatePassword: (newPassword: string) => Promise<{ error?: string }>;
  signOut: () => Promise<void>;
  refreshProfile: () => Promise<void>;
};
