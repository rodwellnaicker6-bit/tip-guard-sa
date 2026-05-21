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
import { resetPostAuthRedirectState } from "../hooks/usePostAuthRedirect";
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
  const [sessionReady, setSessionReady] = useState(false);
  const [profileReady, setProfileReady] = useState(true);
  const mountedRef = useRef(true);
  const accountAbortRef = useRef<AbortController | null>(null);
  const sessionReadyRef = useRef(false);
  const reconnectBusyRef = useRef(false);

  const authReady = sessionReady && profileReady;
  const loading = !authReady;

  useEffect(() => {
    mountedRef.current = true;
    return () => {
      mountedRef.current = false;
    };
  }, []);

  const loadAccount = useCallback(async (uid: string, signal?: AbortSignal) => {
    if (!isSupabaseBrowserConfigured) return;
    try {
      const [profRes, guardRes, merchRes] = await Promise.all([
        supabase.from("profiles").select("role").eq("id", uid).maybeSingle(),
        supabase.from("guards").select("id").eq("user_id", uid).maybeSingle(),
        supabase.from("merchants").select("id").eq("user_id", uid).maybeSingle(),
      ]);
      if (signal?.aborted || !mountedRef.current) return;
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
      if (signal?.aborted || !mountedRef.current) return;
      console.error("[AuthCrash] AuthProvider.loadAccount", e);
      setRole(null);
      setHasGuardRow(false);
      setHasMerchantRow(false);
    } finally {
      if (
        mountedRef.current &&
        (!signal?.aborted || accountAbortRef.current?.signal === signal)
      ) {
        setProfileReady(true);
      }
    }
  }, []);

  const refreshProfile = useCallback(async () => {
    if (!user?.id) {
      if (!mountedRef.current) return;
      setRole(null);
      setHasGuardRow(false);
      setHasMerchantRow(false);
      setProfileReady(true);
      return;
    }
    const ac = new AbortController();
    accountAbortRef.current?.abort();
    accountAbortRef.current = ac;
    setProfileReady(false);
    await loadAccount(user.id, ac.signal);
  }, [loadAccount, user]);

  /** Never call Supabase data APIs inside onAuthStateChange — defer to avoid auth deadlocks. */
  const scheduleLoadAccount = useCallback(
    (uid: string) => {
      if (!mountedRef.current) return;
      setProfileReady(false);
      accountAbortRef.current?.abort();
      const ac = new AbortController();
      accountAbortRef.current = ac;
      queueMicrotask(() => {
        void loadAccount(uid, ac.signal);
      });
    },
    [loadAccount],
  );

  const markSessionReady = useCallback(() => {
    if (sessionReadyRef.current || !mountedRef.current) return;
    sessionReadyRef.current = true;
    setSessionReady(true);
  }, []);

  const authBootRef = useRef(0);

  useEffect(() => {
    const bootGen = ++authBootRef.current;
    sessionReadyRef.current = false;
    let effectCancelled = false;

    if (!isSupabaseBrowserConfigured) {
      queueMicrotask(() => {
        if (effectCancelled || !mountedRef.current) return;
        setSession(null);
        setUser(null);
        setRole(null);
        setHasGuardRow(false);
        setHasMerchantRow(false);
        markSessionReady();
      });
      return () => {
        effectCancelled = true;
      };
    }

    const applySession = (next: AuthContextValue["session"]) => {
      if (!mountedRef.current) return;
      setSession(next);
      setUser(next?.user ?? null);
      if (!next?.user?.id) {
        setRole(null);
        setHasGuardRow(false);
        setHasMerchantRow(false);
        setProfileReady(true);
      }
    };

    const {
      data: { subscription },
    } = supabase.auth.onAuthStateChange((event, next) => {
      if (!mountedRef.current) return;
      applySession(next);
      // TOKEN_REFRESHED can fire in a tight loop and abort in-flight profile loads,
      // leaving profileReady false and blocking post-login redirects.
      if (
        next?.user?.id &&
        (event === "INITIAL_SESSION" || event === "SIGNED_IN" || event === "USER_UPDATED")
      ) {
        scheduleLoadAccount(next.user.id);
      }
      if (
        event === "INITIAL_SESSION" ||
        event === "SIGNED_IN" ||
        event === "TOKEN_REFRESHED" ||
        event === "SIGNED_OUT"
      ) {
        markSessionReady();
      }
    });

    queueMicrotask(() => {
      void supabase.auth.getSession().then(({ data: { session: next } }) => {
        if (bootGen !== authBootRef.current || effectCancelled || !mountedRef.current) return;
        if (next) {
          applySession(next);
          if (next.user?.id) scheduleLoadAccount(next.user.id);
        } else {
          applySession(null);
        }
        markSessionReady();
      });
    });

    const bootFallback = window.setTimeout(() => {
      if (mountedRef.current && !sessionReadyRef.current) {
        console.warn("[AuthProvider] session hydration timeout — marking session ready");
        markSessionReady();
      }
    }, 10_000);

    return () => {
      effectCancelled = true;
      window.clearTimeout(bootFallback);
      subscription.unsubscribe();
      accountAbortRef.current?.abort();
    };
  }, [markSessionReady, scheduleLoadAccount]);

  /** Re-sync session after tab focus without extra auth listeners. */
  useEffect(() => {
    if (!isSupabaseBrowserConfigured) return;

    const reconnect = () => {
      if (document.visibilityState !== "visible" || reconnectBusyRef.current) return;
      reconnectBusyRef.current = true;
      void supabase.auth
        .getSession()
        .then(({ data: { session: next } }) => {
          if (!mountedRef.current || !next) return;
          setSession(next);
          setUser(next.user ?? null);
          if (next.user?.id) {
            scheduleLoadAccount(next.user.id);
          }
        })
        .catch((e) => {
          if (import.meta.env.DEV) console.warn("[AuthProvider] reconnect getSession", e);
        })
        .finally(() => {
          reconnectBusyRef.current = false;
        });
    };

    const onFocus = () => reconnect();
    const onVisibility = () => {
      if (document.visibilityState === "visible") reconnect();
    };

    window.addEventListener("focus", onFocus);
    document.addEventListener("visibilitychange", onVisibility);
    return () => {
      window.removeEventListener("focus", onFocus);
      document.removeEventListener("visibilitychange", onVisibility);
    };
  }, [scheduleLoadAccount]);

  const signIn = useCallback(async (email: string, password: string) => {
    if (!isSupabaseBrowserConfigured) {
      return { error: "Supabase is not configured. Check VITE_SUPABASE_URL and VITE_SUPABASE_ANON_KEY in .env." };
    }
    try {
      const { error } = await supabase.auth.signInWithPassword({ email, password });
      if (!mountedRef.current) return {};
      if (error) {
        if (import.meta.env.DEV) console.warn("[AuthProvider] signIn:", error.message);
        return { error: formatAuthUserFacingError(error) };
      }
      return {};
    } catch (e) {
      if (!mountedRef.current) return {};
      console.error("[AuthCrash] AuthProvider.signIn", e);
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
        if (!mountedRef.current) return {};
        if (error) {
          return { error: formatAuthUserFacingError(error) };
        }
        const needsEmailVerification = !data.session && !!data.user;
        return { needsEmailVerification };
      } catch (e) {
        if (!mountedRef.current) return {};
        console.error("[AuthCrash] AuthProvider.signUp", e);
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
      if (!mountedRef.current) return {};
      if (error) {
        if (import.meta.env.DEV) console.error("[resendSignupEmail] Supabase auth error", error);
        return { error: formatAuthUserFacingError(error) };
      }
      return {};
    } catch (e) {
      if (!mountedRef.current) return {};
      console.error("[AuthCrash] AuthProvider.resendSignupEmail", e);
      return { error: formatAuthUserFacingError(e) };
    }
  }, []);

  const signInWithPhoneOtp = useCallback(async (phone: string) => {
    try {
      const p = normalizeZaPhone(phone);
      const { error } = await supabase.auth.signInWithOtp({ phone: p });
      if (!mountedRef.current) return {};
      if (error) return { error: formatAuthUserFacingError(error) };
      return {};
    } catch (e) {
      if (!mountedRef.current) return {};
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
      if (!mountedRef.current) return {};
      if (error) return { error: formatAuthUserFacingError(error) };
      return {};
    } catch (e) {
      if (!mountedRef.current) return {};
      return { error: formatAuthUserFacingError(e) };
    }
  }, []);

  const signInMagicLink = useCallback(async (email: string) => {
    try {
      const { error } = await supabase.auth.signInWithOtp({
        email,
        options: { emailRedirectTo: getAuthCallbackUrl() },
      });
      if (!mountedRef.current) return {};
      if (error) return { error: formatAuthUserFacingError(error) };
      return {};
    } catch (e) {
      if (!mountedRef.current) return {};
      return { error: formatAuthUserFacingError(e) };
    }
  }, []);

  const resetPasswordForEmail = useCallback(async (email: string) => {
    try {
      const { error } = await supabase.auth.resetPasswordForEmail(email, {
        redirectTo: getAuthResetUrl(),
      });
      if (!mountedRef.current) return {};
      if (error) return { error: formatAuthUserFacingError(error) };
      return {};
    } catch (e) {
      if (!mountedRef.current) return {};
      return { error: formatAuthUserFacingError(e) };
    }
  }, []);

  const updatePassword = useCallback(async (newPassword: string) => {
    try {
      const { error } = await supabase.auth.updateUser({ password: newPassword });
      if (!mountedRef.current) return {};
      if (error) return { error: formatAuthUserFacingError(error) };
      return {};
    } catch (e) {
      if (!mountedRef.current) return {};
      return { error: formatAuthUserFacingError(e) };
    }
  }, []);

  const signOut = useCallback(async () => {
    clearAuthRedirectStorage();
    resetPostAuthRedirectState();
    accountAbortRef.current?.abort();
    try {
      await supabase.auth.signOut({ scope: "local" });
    } catch (e) {
      if (import.meta.env.DEV) console.warn("[AuthProvider] signOut", e);
    }
    if (!mountedRef.current) return;
    setSession(null);
    setUser(null);
    setRole(null);
    setHasGuardRow(false);
    setHasMerchantRow(false);
    setProfileReady(true);
    markSessionReady();
  }, [markSessionReady]);

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
        sessionReady,
        profileReady,
        authReady,
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
      sessionReady,
      profileReady,
      authReady,
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
