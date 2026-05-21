import {
  useCallback,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from "react";
import { formatAuthUserFacingError } from "../lib/supabaseAuthErrors";
import { clearAuthRedirectStorage } from "../lib/authRedirect";
import { normalizeZaPhone } from "../lib/normalizeZaPhone";
import { isSupabaseBrowserConfigured, supabase } from "../lib/supabase";
import { AuthContext } from "./authReactContext";
import type { AuthContextValue, AuthRole } from "./authTypes";

/**
 * Auth state provider. This module exports only this component so React Fast Refresh stays valid.
 * Consumer hook: `import { useAuth } from "./useAuth"`.
 */
export function AuthProvider({ children }: { children: ReactNode }) {
  const [session, setSession] = useState<AuthContextValue["session"]>(null);
  const [user, setUser] = useState<AuthContextValue["user"]>(null);
  const [role, setRole] = useState<AuthRole>(null);
  const [hasGuardRow, setHasGuardRow] = useState(false);
  const [hasMerchantRow, setHasMerchantRow] = useState(false);
  const [loading, setLoading] = useState(true);

  const loadAccount = useCallback(async (uid: string, signal?: AbortSignal) => {
    try {
      const [profRes, guardRes, merchRes] = await Promise.all([
        supabase.from("profiles").select("role").eq("id", uid).maybeSingle(),
        supabase.from("guards").select("id").eq("user_id", uid).maybeSingle(),
        supabase.from("merchants").select("id").eq("user_id", uid).maybeSingle(),
      ]);
      if (signal?.aborted) return;
      if (profRes.error || !profRes.data?.role) {
        setRole(null);
      } else {
        setRole(profRes.data.role as AuthRole);
      }
      setHasGuardRow(!!guardRes.data && !guardRes.error);
      setHasMerchantRow(!!merchRes.data && !merchRes.error);
    } catch {
      if (signal?.aborted) return;
      setRole(null);
      setHasGuardRow(false);
      setHasMerchantRow(false);
    }
  }, []);

  const refreshProfile = useCallback(async () => {
    if (!user?.id) {
      setRole(null);
      setHasGuardRow(false);
      setHasMerchantRow(false);
      return;
    }
    await loadAccount(user.id);
  }, [loadAccount, user]);

  useEffect(() => {
    let mounted = true;

    const applySession = (next: AuthContextValue["session"]) => {
      if (!mounted) return;
      setSession(next);
      setUser(next?.user ?? null);
      if (!next?.user?.id) {
        setRole(null);
        setHasGuardRow(false);
        setHasMerchantRow(false);
      }
    };

    if (!isSupabaseBrowserConfigured) {
      applySession(null);
      void Promise.resolve().then(() => {
        if (mounted) setLoading(false);
      });
      return () => {
        mounted = false;
      };
    }

    const {
      data: { subscription },
    } = supabase.auth.onAuthStateChange((event, next) => {
      applySession(next);
      if (next?.user?.id) {
        void loadAccount(next.user.id);
      }
      if (event === "INITIAL_SESSION") {
        setLoading(false);
      }
    });

    void (async () => {
      try {
        const { data, error } = await supabase.auth.getSession();
        if (!mounted) return;
        if (error && import.meta.env.DEV) {
          console.warn("[AuthProvider] getSession:", error.message);
        }
        applySession(data.session);
        if (data.session?.user?.id) {
          await loadAccount(data.session.user.id);
        }
      } catch (e) {
        if (import.meta.env.DEV) console.warn("[AuthProvider] getSession failed", e);
        if (mounted) applySession(null);
      } finally {
        if (mounted) setLoading(false);
      }
    })();

    return () => {
      mounted = false;
      subscription.unsubscribe();
    };
  }, [loadAccount]);

  const signIn = useCallback(async (email: string, password: string) => {
    try {
      const { error } = await supabase.auth.signInWithPassword({ email, password });
      if (error) return { error: formatAuthUserFacingError(error) };
      return {};
    } catch (e) {
      return { error: formatAuthUserFacingError(e) };
    }
  }, []);

  const signUp = useCallback(
    async (email: string, password: string, fullName: string, nextRole: Exclude<AuthRole, null>) => {
      const redirect = typeof window !== "undefined" ? `${window.location.origin}/auth/callback` : undefined;
      try {
        const { data, error } = await supabase.auth.signUp({
          email,
          password,
          options: {
            emailRedirectTo: redirect,
            data: { role: nextRole, full_name: fullName },
          },
        });
        if (error) {
          if (import.meta.env.DEV) {
            console.error("[signUp] Supabase auth error", {
              message: error.message,
              status: error.status,
              name: error.name,
            });
          }
          return { error: formatAuthUserFacingError(error) };
        }
        const needsEmailVerification = !data.session && !!data.user;
        return { needsEmailVerification };
      } catch (e) {
        if (import.meta.env.DEV) console.error("[signUp] unexpected error", e);
        return { error: formatAuthUserFacingError(e) };
      }
    },
    [],
  );

  const resendSignupEmail = useCallback(async (email: string) => {
    const redirect = typeof window !== "undefined" ? `${window.location.origin}/auth/callback` : undefined;
    try {
      const { error } = await supabase.auth.resend({
        type: "signup",
        email,
        options: { emailRedirectTo: redirect },
      });
      if (error) {
        if (import.meta.env.DEV) console.error("[resendSignupEmail] Supabase auth error", error);
        return { error: formatAuthUserFacingError(error) };
      }
      return {};
    } catch (e) {
      if (import.meta.env.DEV) console.error("[resendSignupEmail] unexpected error", e);
      return { error: formatAuthUserFacingError(e) };
    }
  }, []);

  const signInWithPhoneOtp = useCallback(async (phone: string) => {
    try {
      const p = normalizeZaPhone(phone);
      const { error } = await supabase.auth.signInWithOtp({ phone: p });
      if (error) return { error: formatAuthUserFacingError(error) };
      return {};
    } catch (e) {
      return { error: formatAuthUserFacingError(e) };
    }
  }, []);

  const verifyPhoneOtp = useCallback(async (phone: string, token: string) => {
    try {
      const p = normalizeZaPhone(phone);
      const { error } = await supabase.auth.verifyOtp({
        phone: p,
        token,
        type: "sms",
      });
      if (error) return { error: formatAuthUserFacingError(error) };
      return {};
    } catch (e) {
      return { error: formatAuthUserFacingError(e) };
    }
  }, []);

  const signInMagicLink = useCallback(async (email: string) => {
    try {
      const redirect = typeof window !== "undefined" ? `${window.location.origin}/auth/callback` : undefined;
      const { error } = await supabase.auth.signInWithOtp({
        email,
        options: { emailRedirectTo: redirect },
      });
      if (error) return { error: formatAuthUserFacingError(error) };
      return {};
    } catch (e) {
      return { error: formatAuthUserFacingError(e) };
    }
  }, []);

  const resetPasswordForEmail = useCallback(async (email: string) => {
    try {
      const redirect = typeof window !== "undefined" ? `${window.location.origin}/auth/reset` : undefined;
      const { error } = await supabase.auth.resetPasswordForEmail(email, { redirectTo: redirect });
      if (error) return { error: formatAuthUserFacingError(error) };
      return {};
    } catch (e) {
      return { error: formatAuthUserFacingError(e) };
    }
  }, []);

  const updatePassword = useCallback(async (newPassword: string) => {
    try {
      const { error } = await supabase.auth.updateUser({ password: newPassword });
      if (error) return { error: formatAuthUserFacingError(error) };
      return {};
    } catch (e) {
      return { error: formatAuthUserFacingError(e) };
    }
  }, []);

  const signOut = useCallback(async () => {
    clearAuthRedirectStorage();
    await supabase.auth.signOut();
    setSession(null);
    setUser(null);
    setRole(null);
    setHasGuardRow(false);
    setHasMerchantRow(false);
  }, []);

  const isGuardUser = role === "guard" || hasGuardRow;
  const isMerchantUser = role === "merchant" || hasMerchantRow;

  const value = useMemo(
    () =>
      ({
        user,
        session,
        role,
        hasGuardRow,
        hasMerchantRow,
        isGuardUser,
        isMerchantUser,
        loading,
        signIn,
        signUp,
        resendSignupEmail,
        signInWithPhoneOtp,
        verifyPhoneOtp,
        signInMagicLink,
        resetPasswordForEmail,
        updatePassword,
        signOut,
        refreshProfile,
      }) satisfies AuthContextValue,
    [
      user,
      session,
      role,
      hasGuardRow,
      hasMerchantRow,
      isGuardUser,
      isMerchantUser,
      loading,
      signIn,
      signUp,
      resendSignupEmail,
      signInWithPhoneOtp,
      verifyPhoneOtp,
      signInMagicLink,
      resetPasswordForEmail,
      updatePassword,
      signOut,
      refreshProfile,
    ],
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}
