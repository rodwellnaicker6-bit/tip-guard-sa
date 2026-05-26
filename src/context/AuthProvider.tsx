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
import { isTransientNetworkError } from "../lib/networkUtils";
import { resetPostAuthRedirectState } from "../hooks/usePostAuthRedirect";
import { clearAuthRedirectStorage } from "../lib/authRedirect";
import { normalizeZaPhone } from "../lib/normalizeZaPhone";
import { bootLog } from "../lib/bootDebug";
import { stabilLog } from "../lib/stabilLog";
import { isSupabaseBrowserConfigured, supabase } from "../lib/supabase";
import { AuthContext } from "./authReactContext";
import type {
  AuthAccountSnapshot,
  AuthContextValue,
  AuthProfileFields,
  AuthRole,
} from "./authTypes";

/**
 * Auth state provider. This module exports only this component so React Fast Refresh stays valid.
 * Consumer hook: `import { useAuth } from "./useAuth"`.
 */
export function AuthProvider({ children }: { children: ReactNode }) {
  const [session, setSession] = useState<AuthContextValue["session"]>(null);
  const [user, setUser] = useState<AuthContextValue["user"]>(null);
  const [role, setRole] = useState<AuthRole>(null);
  const [profileFields, setProfileFields] = useState<AuthProfileFields>({ full_name: null, phone: null });
  const [hasGuardRow, setHasGuardRow] = useState(false);
  const [hasMerchantRow, setHasMerchantRow] = useState(false);
  const [sessionReady, setSessionReady] = useState(false);
  const [profileReady, setProfileReady] = useState(true);
  const [authBootError, setAuthBootError] = useState<string | null>(null);
  const mountedRef = useRef(true);
  const accountAbortRef = useRef<AbortController | null>(null);
  const accountLoadGenRef = useRef(0);
  const sessionReadyRef = useRef(false);
  const reconnectBusyRef = useRef(false);

  /** Emergency: session hydration only — profile loads in background (no route black screen). */
  const authReady = sessionReady;
  const loading = !authReady;

  useEffect(() => {
    mountedRef.current = true;
    return () => {
      mountedRef.current = false;
    };
  }, []);

  const loadAccount = useCallback(
    async (uid: string, signal?: AbortSignal, loadGen?: number): Promise<AuthAccountSnapshot | null> => {
      if (!isSupabaseBrowserConfigured) return null;
      let snapshot: AuthAccountSnapshot = {
        role: null,
        profileFields: { full_name: null, phone: null },
        hasGuardRow: false,
        hasMerchantRow: false,
      };
      try {
        const [profRes, guardRes, merchRes] = await Promise.all([
          supabase.from("profiles").select("role, full_name, phone").eq("id", uid).maybeSingle(),
          supabase.from("guards").select("id").eq("user_id", uid).maybeSingle(),
          supabase.from("merchants").select("id").eq("user_id", uid).maybeSingle(),
        ]);
        if (signal?.aborted || !mountedRef.current) return null;
        const hasGuardRow = !!guardRes.data && !guardRes.error;
        const hasMerchantRow = !!merchRes.data && !merchRes.error;
        if (profRes.error) {
          if (import.meta.env.DEV) console.warn("[AuthProvider] profiles:", profRes.error.message);
          setRole(null);
          setProfileFields({ full_name: null, phone: null });
        } else if (profRes.data) {
          const nextRole = (profRes.data.role as AuthRole) ?? null;
          const nextFields: AuthProfileFields = {
            full_name: (profRes.data.full_name as string | null) ?? null,
            phone: (profRes.data.phone as string | null) ?? null,
          };
          setRole(nextRole);
          setProfileFields(nextFields);
          snapshot = { role: nextRole, profileFields: nextFields, hasGuardRow, hasMerchantRow };
        } else {
          setRole(null);
          setProfileFields({ full_name: null, phone: null });
          snapshot = {
            role: null,
            profileFields: { full_name: null, phone: null },
            hasGuardRow,
            hasMerchantRow,
          };
        }
        setHasGuardRow(hasGuardRow);
        setHasMerchantRow(hasMerchantRow);
        if (profRes.error) {
          snapshot = {
            role: null,
            profileFields: { full_name: null, phone: null },
            hasGuardRow,
            hasMerchantRow,
          };
        }
      } catch (e) {
        if (signal?.aborted || !mountedRef.current) return null;
        console.error("[AuthCrash] AuthProvider.loadAccount", e);
        setRole(null);
        setProfileFields({ full_name: null, phone: null });
        setHasGuardRow(false);
        setHasMerchantRow(false);
        snapshot = {
          role: null,
          profileFields: { full_name: null, phone: null },
          hasGuardRow: false,
          hasMerchantRow: false,
        };
      } finally {
        if (mountedRef.current && loadGen === accountLoadGenRef.current) {
          setProfileReady(true);
        }
      }
      return snapshot;
    },
    [],
  );

  const refreshProfile = useCallback(
    async (options?: { silent?: boolean }) => {
      if (!user?.id) {
        if (!mountedRef.current) return null;
        setRole(null);
        setProfileFields({ full_name: null, phone: null });
        setHasGuardRow(false);
        setHasMerchantRow(false);
        setProfileReady(true);
        return null;
      }
      const ac = new AbortController();
      accountAbortRef.current?.abort();
      accountAbortRef.current = ac;
      if (!options?.silent) setProfileReady(false);
      const gen = ++accountLoadGenRef.current;
      return loadAccount(user.id, ac.signal, gen);
    },
    [loadAccount, user],
  );

  /** Never call Supabase data APIs inside onAuthStateChange — defer to avoid auth deadlocks. */
  const scheduleLoadAccount = useCallback(
    (uid: string) => {
      if (!mountedRef.current) return;
      const gen = ++accountLoadGenRef.current;
      setProfileReady(false);
      accountAbortRef.current?.abort();
      const ac = new AbortController();
      accountAbortRef.current = ac;
      queueMicrotask(() => {
        void loadAccount(uid, ac.signal, gen);
      });
    },
    [loadAccount],
  );

  const markSessionReady = useCallback(() => {
    if (sessionReadyRef.current || !mountedRef.current) return;
    sessionReadyRef.current = true;
    setSessionReady(true);
    stabilLog("auth", "session hydration complete");
  }, []);

  const authBootRef = useRef(0);

  useEffect(() => {
    const bootGen = ++authBootRef.current;
    sessionReadyRef.current = false;
    let effectCancelled = false;
    bootLog("AuthProvider boot", { configured: isSupabaseBrowserConfigured });

    if (!isSupabaseBrowserConfigured) {
      queueMicrotask(() => {
        if (effectCancelled || !mountedRef.current) return;
        setAuthBootError(null);
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
      void supabase.auth
        .getSession()
        .then(({ data: { session: next }, error }) => {
          if (bootGen !== authBootRef.current || effectCancelled || !mountedRef.current) return;
          if (error) {
            bootLog("getSession error", error.message);
            setAuthBootError("We could not restore your session. Sign in again or reload the page.");
            applySession(null);
            markSessionReady();
            return;
          }
          setAuthBootError(null);
          if (next) {
            applySession(next);
            if (next.user?.id) scheduleLoadAccount(next.user.id);
          } else {
            applySession(null);
          }
          markSessionReady();
        })
        .catch((e) => {
          if (bootGen !== authBootRef.current || effectCancelled || !mountedRef.current) return;
          const msg = e instanceof Error ? e.message : "Session check failed";
          console.error("[AuthCrash] AuthProvider.getSession", e);
          setAuthBootError(msg);
          applySession(null);
          markSessionReady();
        });
    });

    const bootFallback = window.setTimeout(() => {
      if (mountedRef.current && !sessionReadyRef.current) {
        bootLog("session hydration timeout — marking ready");
        stabilLog("auth", "session hydration timeout — unblocking UI");
        markSessionReady();
      }
    }, 5_000);

    const profileFallback = window.setTimeout(() => {
      if (mountedRef.current) {
        setProfileReady((ready) => {
          if (!ready) bootLog("profile load timeout — marking ready");
          return true;
        });
      }
    }, 8_000);

    return () => {
      effectCancelled = true;
      window.clearTimeout(bootFallback);
      window.clearTimeout(profileFallback);
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
      for (let attempt = 0; attempt < 3; attempt++) {
        const { error } = await supabase.auth.signInWithPassword({ email, password });
        if (!mountedRef.current) return {};
        if (!error) return {};
        if (import.meta.env.DEV) console.warn("[AuthProvider] signIn:", error.message);
        const msg = formatAuthUserFacingError(error);
        if (attempt < 2 && isTransientNetworkError(error.message)) {
          await new Promise((r) => setTimeout(r, 350 * (attempt + 1)));
          continue;
        }
        return { error: msg };
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
    setAuthBootError(null);
    setSession(null);
    setUser(null);
    setRole(null);
    setProfileFields({ full_name: null, phone: null });
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
        profileFields,
        hasGuardRow,
        hasMerchantRow,
        isGuardUser,
        isMerchantUser,
        sessionReady,
        profileReady,
        authReady,
        loading,
        authBootError,
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
      profileFields,
      hasGuardRow,
      hasMerchantRow,
      isGuardUser,
      isMerchantUser,
      sessionReady,
      profileReady,
      authReady,
      loading,
      authBootError,
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
