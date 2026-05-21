import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from "react";
import { getAuthCallbackUrl, getAuthResetUrl } from "../lib/appOrigin";
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
  const accountAbortRef = useRef<AbortController | null>(null);
  const bootDoneRef = useRef(false);

  const loadAccount = useCallback(async (uid: string, signal?: AbortSignal) => {
    if (!isSupabaseBrowserConfigured) return;
    try {
      const [profRes, guardRes, merchRes] = await Promise.all([
        supabase.from("profiles").select("role").eq("id", uid).maybeSingle(),
        supabase.from("guards").select("id").eq("user_id", uid).maybeSingle(),
        supabase.from("merchants").select("id").eq("user_id", uid).maybeSingle(),
      ]);
      if (signal?.aborted) return;
      if (profRes.error) {
        if (import.meta.env.DEV) console.warn("[AuthProvider] profiles:", profRes.error.message);
        setRole(null);
      } else if (profRes.data?.role) {
        setRole(profRes.data.role as AuthRole);
      } else {
        setRole(null);
      }
      setHasGuardRow(!!guardRes.data && !guardRes.error);
      setHasMerchantRow(!!merchRes.data && !merchRes.error);
    } catch (e) {
      if (signal?.aborted) return;
      if (import.meta.env.DEV) console.warn("[AuthProvider] loadAccount failed", e);
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
    const ac = new AbortController();
    accountAbortRef.current?.abort();
    accountAbortRef.current = ac;
    await loadAccount(user.id, ac.signal);
  }, [loadAccount, user]);

  /** Never call Supabase data APIs inside onAuthStateChange — defer to avoid auth deadlocks. */
  const scheduleLoadAccount = useCallback(
    (uid: string) => {
      accountAbortRef.current?.abort();
      const ac = new AbortController();
      accountAbortRef.current = ac;
      queueMicrotask(() => {
        void loadAccount(uid, ac.signal);
      });
    },
    [loadAccount],
  );

  const finishBoot = useCallback(() => {
    if (bootDoneRef.current) return;
    bootDoneRef.current = true;
    setLoading(false);
  }, []);

  useEffect(() => {
    let mounted = true;
    bootDoneRef.current = false;
    setLoading(true);

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
      finishBoot();
      return () => {
        mounted = false;
      };
    }

    const {
      data: { subscription },
    } = supabase.auth.onAuthStateChange((event, next) => {
      if (!mounted) return;
      if (import.meta.env.DEV) {
        console.info(`[AuthProvider] auth event: ${event}`);
      }
      applySession(next);
      if (next?.user?.id) {
        scheduleLoadAccount(next.user.id);
      }
      if (event === "INITIAL_SESSION") {
        finishBoot();
      }
      if (event === "SIGNED_OUT") {
        finishBoot();
      }
    });

    const bootFallback = window.setTimeout(() => {
      if (mounted && !bootDoneRef.current) {
        if (import.meta.env.DEV) {
          console.warn("[AuthProvider] boot fallback — forcing loading false");
        }
        finishBoot();
      }
    }, 10_000);

    return () => {
      mounted = false;
      window.clearTimeout(bootFallback);
      subscription.unsubscribe();
      accountAbortRef.current?.abort();
    };
  }, [finishBoot, scheduleLoadAccount]);

  const signIn = useCallback(async (email: string, password: string) => {
    if (!isSupabaseBrowserConfigured) {
      return { error: "Supabase is not configured. Check VITE_SUPABASE_URL and VITE_SUPABASE_ANON_KEY in .env." };
    }
    try {
      const { error } = await supabase.auth.signInWithPassword({ email, password });
      if (error) {
        if (import.meta.env.DEV) console.warn("[AuthProvider] signIn:", error.message);
        return { error: formatAuthUserFacingError(error) };
      }
      return {};
    } catch (e) {
      if (import.meta.env.DEV) console.warn("[AuthProvider] signIn failed", e);
      return { error: formatAuthUserFacingError(e) };
    }
  }, []);

  const signUp = useCallback(
    async (email: string, password: string, fullName: string, nextRole: Exclude<AuthRole, null>) => {
      try {
        const { data, error } = await supabase.auth.signUp({
          email,
          password,
          options: {
            emailRedirectTo: getAuthCallbackUrl(),
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
    try {
      const { error } = await supabase.auth.resend({
        type: "signup",
        email,
        options: { emailRedirectTo: getAuthCallbackUrl() },
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
      const { error } = await supabase.auth.signInWithOtp({
        email,
        options: { emailRedirectTo: getAuthCallbackUrl() },
      });
      if (error) return { error: formatAuthUserFacingError(error) };
      return {};
    } catch (e) {
      return { error: formatAuthUserFacingError(e) };
    }
  }, []);

  const resetPasswordForEmail = useCallback(async (email: string) => {
    try {
      const { error } = await supabase.auth.resetPasswordForEmail(email, {
        redirectTo: getAuthResetUrl(),
      });
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
    accountAbortRef.current?.abort();
    try {
      await supabase.auth.signOut({ scope: "local" });
    } catch (e) {
      if (import.meta.env.DEV) console.warn("[AuthProvider] signOut", e);
    }
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
