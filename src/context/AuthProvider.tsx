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
import { logAuth, logAuthKickout } from "../lib/authDebug";
import { bootLog } from "../lib/bootDebug";
import { logOnboarding } from "../lib/onboardingDebug";
import { stabilLog } from "../lib/stabilLog";
import { subscriptionManager } from "../lib/subscriptionManager";
import { clearPendingRole, readPendingRole, writePendingRole } from "../lib/pendingRoleStorage";
import { isSupabaseBrowserConfigured, supabase } from "../lib/supabase";
import {
  readPersistedAuthSession,
  supabaseAuthStorageKey,
} from "../lib/supabaseAuthStorage";
import { normalizeSupabaseUrl } from "../lib/supabaseProject";
import { withTimeout } from "../lib/asyncTimeout";
import { AuthContext } from "./authReactContext";
import type {
  AuthAccountSnapshot,
  AuthContextValue,
  AuthProfileFields,
  AuthRole,
} from "./authTypes";

const AUTH_SESSION_TIMEOUT_MS = 10_000;
/** Must exceed AUTH_SESSION_TIMEOUT_MS so we do not mark ready before getSession settles. */
const AUTH_BOOT_READY_FALLBACK_MS = AUTH_SESSION_TIMEOUT_MS + 2_000;
const AUTH_REQUEST_TIMEOUT_MS = 15_000;
const AUTH_PROFILE_TIMEOUT_MS = 10_000;

function logAccountRequest(
  label: string,
  detail: Record<string, unknown>,
): void {
  console.info(`[TipGuard:account] ${label}`, detail);
}

function readBootPersistedAuth(): Pick<AuthContextValue, "session" | "user"> {
  const rawUrl = import.meta.env.VITE_SUPABASE_URL?.trim();
  if (!rawUrl || !isSupabaseBrowserConfigured) {
    return { session: null, user: null };
  }
  const session = readPersistedAuthSession(normalizeSupabaseUrl(rawUrl));
  return { session, user: session?.user ?? null };
}

/**
 * Auth state provider. This module exports only this component so React Fast Refresh stays valid.
 * Consumer hook: `import { useAuth } from "./useAuth"`.
 */
export function AuthProvider({ children }: { children: ReactNode }) {
  const bootAuth = readBootPersistedAuth();
  const [session, setSession] = useState<AuthContextValue["session"]>(bootAuth.session);
  const [user, setUser] = useState<AuthContextValue["user"]>(bootAuth.user);
  const [role, setRole] = useState<AuthRole>(null);
  const [pendingRole, setPendingRoleState] = useState<AuthRole>(null);
  const [profileFields, setProfileFields] = useState<AuthProfileFields>({ full_name: null, phone: null });
  const [hasGuardRow, setHasGuardRow] = useState(false);
  const [hasMerchantRow, setHasMerchantRow] = useState(false);
  const [sessionReady, setSessionReady] = useState(false);
  const [profileReady, setProfileReady] = useState(true);
  const [authBootError, setAuthBootError] = useState<string | null>(null);
  const mountedRef = useRef(true);
  const accountAbortRef = useRef<AbortController | null>(null);
  const accountLoadGenRef = useRef(0);
  const profileLoadInflightUidRef = useRef<string | null>(null);
  const refreshInFlightRef = useRef<Promise<AuthAccountSnapshot | null> | null>(null);
  const refreshSourceRef = useRef<string | null>(null);
  const sessionReadyRef = useRef(false);
  const reconnectBusyRef = useRef(false);
  const lastReconnectAtRef = useRef(0);
  const RECONNECT_COOLDOWN_MS = 2_000;
  /** Last known good session — guards against transient null during TOKEN_REFRESHED. */
  const sessionSnapshotRef = useRef<AuthContextValue["session"]>(bootAuth.session);
  const accountStateRef = useRef({
    role: null as AuthRole,
    pendingRole: null as AuthRole,
    profileFields: { full_name: null, phone: null } as AuthProfileFields,
    hasGuardRow: false,
    hasMerchantRow: false,
  });

  useEffect(() => {
    accountStateRef.current = { role, pendingRole, profileFields, hasGuardRow, hasMerchantRow };
  }, [role, pendingRole, profileFields, hasGuardRow, hasMerchantRow]);

  /** Session + profile hydration complete before route guards redirect. */
  const authReady = sessionReady && profileReady;
  const loading = !authReady;

  const setPendingRole = useCallback(
    (next: AuthRole) => {
      setPendingRoleState(next);
      writePendingRole(user?.id, next);
    },
    [user?.id],
  );

  const effectiveRole = pendingRole ?? role;

  useEffect(() => {
    mountedRef.current = true;
    return () => {
      mountedRef.current = false;
    };
  }, []);

  const loadAccount = useCallback(
    async (uid: string, signal?: AbortSignal, loadGen?: number): Promise<AuthAccountSnapshot | null> => {
      if (!isSupabaseBrowserConfigured) return null;
      const startedAt = performance.now();
      logAccountRequest("profile fetch start", { uid, loadGen });
      let snapshot: AuthAccountSnapshot;
      try {
        const [profRes, initialGuardRes, initialMerchRes] = await withTimeout(
          Promise.all([
            supabase.from("profiles").select("role, full_name, phone").eq("id", uid).maybeSingle(),
            supabase.from("guards").select("id").eq("user_id", uid).maybeSingle(),
            supabase.from("merchants").select("id").eq("user_id", uid).maybeSingle(),
          ]),
          AUTH_PROFILE_TIMEOUT_MS,
          "Profile load timed out",
        );
        if (signal?.aborted) {
          logOnboarding("loadAccount aborted", { uid, loadGen });
          return null;
        }
        if (!mountedRef.current) return null;

        let guardRes = initialGuardRes;
        let merchRes = initialMerchRes;
        if (guardRes.error && !guardRes.data) {
          guardRes = await withTimeout(
            supabase.from("guards").select("id").eq("user_id", uid).maybeSingle(),
            AUTH_PROFILE_TIMEOUT_MS,
            "Guard profile retry timed out",
          );
        }
        if (merchRes.error && !merchRes.data) {
          merchRes = await withTimeout(
            supabase.from("merchants").select("id").eq("user_id", uid).maybeSingle(),
            AUTH_PROFILE_TIMEOUT_MS,
            "Merchant profile retry timed out",
          );
        }
        if (signal?.aborted || !mountedRef.current) return null;

        const hasGuardRow = !!guardRes.data && !guardRes.error;
        const hasMerchantRow = !!merchRes.data && !merchRes.error;
        logAccountRequest("profile fetch response", {
          uid,
          loadGen,
          ms: Math.round(performance.now() - startedAt),
          profile: {
            ok: !profRes.error,
            error: profRes.error?.message ?? null,
            hasRow: Boolean(profRes.data),
            role: (profRes.data?.role as string | null | undefined) ?? null,
          },
          guard: {
            ok: !guardRes.error,
            error: guardRes.error?.message ?? null,
            hasRow: hasGuardRow,
          },
          merchant: {
            ok: !merchRes.error,
            error: merchRes.error?.message ?? null,
            hasRow: hasMerchantRow,
          },
        });

        if (profRes.error) {
          setAuthBootError(`Profile load failed: ${profRes.error.message}`);
          logAuth("loadAccount profile error — preserving role state", { message: profRes.error.message });
          const cur = accountStateRef.current;
          snapshot = {
            role: cur.pendingRole ?? cur.role,
            profileFields: cur.profileFields,
            hasGuardRow,
            hasMerchantRow,
          };
        } else if (profRes.data) {
          setAuthBootError(null);
          const nextRole = (profRes.data.role as AuthRole) ?? null;
          const nextFields: AuthProfileFields = {
            full_name: (profRes.data.full_name as string | null) ?? null,
            phone: (profRes.data.phone as string | null) ?? null,
          };
          setRole(nextRole);
          setProfileFields(nextFields);
          if (
            nextRole &&
            (nextRole === accountStateRef.current.pendingRole ||
              nextRole === "guard" ||
              nextRole === "merchant" ||
              nextRole === "admin")
          ) {
            setPendingRoleState(null);
            writePendingRole(uid, null);
          }
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
      } catch (e) {
        if (signal?.aborted || !mountedRef.current) return null;
        const message = e instanceof Error ? e.message : String(e);
        console.error("[AuthCrash] AuthProvider.loadAccount", e);
        logAccountRequest("profile fetch failed", {
          uid,
          loadGen,
          ms: Math.round(performance.now() - startedAt),
          error: message,
        });
        setAuthBootError(`Profile load failed: ${message}`);
        logAuth("loadAccount exception — preserving role state", { message });
        const cur = accountStateRef.current;
        snapshot = {
          role: cur.pendingRole ?? cur.role,
          profileFields: cur.profileFields,
          hasGuardRow: cur.hasGuardRow,
          hasMerchantRow: cur.hasMerchantRow,
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
    async (options?: { silent?: boolean; source?: string }) => {
      const source = options?.source ?? "unknown";
      const uid = user?.id ?? sessionSnapshotRef.current?.user?.id;
      if (!uid) {
        logOnboarding("refreshProfile skip (no user)", { source });
        if (!mountedRef.current) return null;
        setRole(null);
        setProfileFields({ full_name: null, phone: null });
        setHasGuardRow(false);
        setHasMerchantRow(false);
        setProfileReady(true);
        return null;
      }
      if (refreshInFlightRef.current) {
        logOnboarding("refreshProfile coalesced", { source, prior: refreshSourceRef.current });
        return refreshInFlightRef.current;
      }
      const t0 = performance.now();
      logOnboarding("refreshProfile start", { source, uid, silent: !!options?.silent });
      refreshSourceRef.current = source;
      const run = async () => {
        const ac = new AbortController();
        accountAbortRef.current?.abort();
        accountAbortRef.current = ac;
        if (!options?.silent) setProfileReady(false);
        const gen = ++accountLoadGenRef.current;
        return loadAccount(uid, ac.signal, gen);
      };
      const p = run()
        .then((snap) => {
          logOnboarding("refreshProfile end", {
            source,
            ms: Math.round(performance.now() - t0),
            role: snap?.role ?? null,
          });
          return snap;
        })
        .catch((e) => {
          logOnboarding("refreshProfile error", {
            source,
            ms: Math.round(performance.now() - t0),
            message: e instanceof Error ? e.message : String(e),
          });
          throw e;
        })
        .finally(() => {
          refreshInFlightRef.current = null;
          refreshSourceRef.current = null;
        });
      refreshInFlightRef.current = p;
      return p;
    },
    [loadAccount, user?.id],
  );

  /** Never call Supabase data APIs inside onAuthStateChange — defer to avoid auth deadlocks. */
  const scheduleLoadAccount = useCallback(
    (uid: string, options?: { force?: boolean }) => {
      if (!mountedRef.current) return;
      if (!options?.force && profileLoadInflightUidRef.current === uid) return;
      profileLoadInflightUidRef.current = uid;
      const gen = ++accountLoadGenRef.current;
      setProfileReady(false);
      accountAbortRef.current?.abort();
      const ac = new AbortController();
      accountAbortRef.current = ac;
      queueMicrotask(() => {
        void loadAccount(uid, ac.signal, gen).finally(() => {
          if (profileLoadInflightUidRef.current === uid) {
            profileLoadInflightUidRef.current = null;
          }
        });
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
  const getSessionSettledRef = useRef(false);

  useEffect(() => {
    const bootGen = ++authBootRef.current;
    getSessionSettledRef.current = false;
    sessionReadyRef.current = false;
    /** Do not clear `sessionSnapshotRef` here — a remount/re-run with live React session would allow a null auth event to wipe the user before getSession finishes. */
    let effectCancelled = false;
    bootLog("AuthProvider boot", {
      configured: isSupabaseBrowserConfigured,
      persistedUid: bootAuth.session?.user?.id ?? null,
    });

    if (bootAuth.session?.user?.id) {
      const storedPending = readPendingRole(bootAuth.session.user.id);
      if (storedPending) setPendingRoleState(storedPending);
      scheduleLoadAccount(bootAuth.session.user.id, { force: true });
    }

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

    const applySession = (next: AuthContextValue["session"], event?: string) => {
      if (!mountedRef.current) return;

      if (next?.user?.id) {
        sessionSnapshotRef.current = next;
        setSession(next);
        setUser((prev) => {
          const nu = next.user;
          if (!nu?.id) return null;
          if (
            prev?.id === nu.id &&
            prev.email === nu.email &&
            prev.updated_at === nu.updated_at
          ) {
            return prev;
          }
          return nu;
        });
        const storedPending = readPendingRole(next.user.id);
        if (storedPending) setPendingRoleState(storedPending);
        return;
      }

      if (event === "SIGNED_OUT") {
        sessionSnapshotRef.current = null;
        logAuthKickout("SIGNED_OUT", "AuthProvider.applySession", { event });
        setSession(null);
        setUser(null);
        setRole(null);
        setHasGuardRow(false);
        setHasMerchantRow(false);
        setProfileReady(true);
        return;
      }

      /** Supabase may emit INITIAL_SESSION with null before storage hydration; getSession() is authoritative. */
      if (event === "INITIAL_SESSION" && !next?.user?.id) {
        logAuth("INITIAL_SESSION null — deferring to getSession (no state clear)", {});
        return;
      }

      if (event === "TOKEN_REFRESHED" && sessionSnapshotRef.current?.user?.id) {
        logAuth("preserved session during TOKEN_REFRESHED (transient null)", {
          uid: sessionSnapshotRef.current.user.id,
        });
        return;
      }

      if (
        sessionSnapshotRef.current?.user?.id &&
        event !== "BOOT_GET_SESSION" &&
        event !== "INITIAL_SESSION"
      ) {
        logAuth("preserved session (transient null)", { event });
        return;
      }

      sessionSnapshotRef.current = null;
      if (event === "BOOT_GET_SESSION") {
        logAuth("no session on boot getSession");
      } else {
        logAuthKickout("session cleared", "AuthProvider.applySession", { event });
      }
      setSession(null);
      setUser(null);
      setRole(null);
      setHasGuardRow(false);
      setHasMerchantRow(false);
      setProfileReady(true);
    };

    const {
      data: { subscription },
    } = supabase.auth.onAuthStateChange((event, next) => {
      if (!mountedRef.current) return;
      if (event === "TOKEN_REFRESHED" || event === "INITIAL_SESSION" || event === "SIGNED_IN") {
        logOnboarding("auth state", {
          event,
          sessionReady: sessionReadyRef.current,
          uid: next?.user?.id ?? null,
        });
        logAuth("onAuthStateChange", {
          event,
          uid: next?.user?.id ?? null,
          hadSnapshot: !!sessionSnapshotRef.current?.user?.id,
        });
      }
      applySession(next, event);
      // TOKEN_REFRESHED can fire in a tight loop and abort in-flight profile loads,
      // leaving profileReady false and blocking post-login redirects.
      const isAnonymousGuest = next?.user?.is_anonymous === true;
      if (isAnonymousGuest) {
        setProfileReady(true);
      } else if (
        next?.user?.id &&
        (event === "INITIAL_SESSION" || event === "SIGNED_IN" || event === "USER_UPDATED")
      ) {
        scheduleLoadAccount(next.user.id, {
          force: event === "SIGNED_IN" || event === "USER_UPDATED",
        });
      }
      const deferSessionReady = event === "INITIAL_SESSION" && !next?.user?.id;
      if (
        (event === "INITIAL_SESSION" ||
          event === "SIGNED_IN" ||
          event === "TOKEN_REFRESHED" ||
          event === "SIGNED_OUT") &&
        !deferSessionReady
      ) {
        markSessionReady();
      }
    });

    subscriptionManager.register("auth:session", () => {
      subscription.unsubscribe();
      accountAbortRef.current?.abort();
    });

    queueMicrotask(() => {
      void withTimeout(
        supabase.auth.getSession(),
        AUTH_SESSION_TIMEOUT_MS,
        "Session check timed out",
      )
        .then(({ data: { session: next }, error }) => {
          getSessionSettledRef.current = true;
          if (bootGen !== authBootRef.current || effectCancelled || !mountedRef.current) return;
          if (error) {
            bootLog("getSession error", error.message);
            const transient = isTransientNetworkError(error.message);
            setAuthBootError(
              transient
                ? "We could not reach the auth server. You can keep using the app offline briefly — try again."
                : "We could not restore your session. Sign in again or reload the page.",
            );
            if (!sessionSnapshotRef.current?.user?.id) {
              logAuthKickout("boot getSession error", "AuthProvider.getSession", { message: error.message });
              applySession(null);
            } else {
              logAuth("boot getSession error — keeping snapshot session", { message: error.message });
            }
            markSessionReady();
            return;
          }
          setAuthBootError(null);
          if (next) {
            applySession(next, "BOOT_GET_SESSION");
            scheduleLoadAccount(next.user.id, { force: true });
          } else if (!sessionSnapshotRef.current?.user?.id) {
            applySession(null, "BOOT_GET_SESSION");
          } else if (sessionSnapshotRef.current?.user?.id) {
            scheduleLoadAccount(sessionSnapshotRef.current.user.id, { force: true });
          }
          markSessionReady();
        })
        .catch((e) => {
          getSessionSettledRef.current = true;
          if (bootGen !== authBootRef.current || effectCancelled || !mountedRef.current) return;
          const msg = e instanceof Error ? e.message : "Session check failed";
          console.error("[AuthCrash] AuthProvider.getSession", e);
          setAuthBootError(msg);
          if (!sessionSnapshotRef.current?.user?.id) {
            logAuthKickout("boot getSession exception", "AuthProvider.getSession", { message: msg });
            applySession(null);
          } else {
            logAuth("boot getSession exception — keeping snapshot session", { message: msg });
          }
          markSessionReady();
        });
    });

    const bootFallback = window.setTimeout(() => {
      if (!mountedRef.current || sessionReadyRef.current) return;
      if (!getSessionSettledRef.current) {
        const rawUrl = import.meta.env.VITE_SUPABASE_URL?.trim();
        if (rawUrl && !sessionSnapshotRef.current?.user?.id) {
          const persisted = readPersistedAuthSession(normalizeSupabaseUrl(rawUrl));
          if (persisted?.user?.id) {
            bootLog("session hydration fallback — applying persisted storage", {
              storageKey: supabaseAuthStorageKey(normalizeSupabaseUrl(rawUrl)),
            });
            applySession(persisted, "BOOT_STORAGE_FALLBACK");
            scheduleLoadAccount(persisted.user.id, { force: true });
          }
        }
        bootLog("session hydration timeout — marking ready", {
          getSessionSettled: getSessionSettledRef.current,
        });
        stabilLog("auth", "session hydration timeout — unblocking UI");
        markSessionReady();
      }
    }, AUTH_BOOT_READY_FALLBACK_MS);

    const profileFallback = window.setTimeout(() => {
      if (!mountedRef.current) return;
      if (profileLoadInflightUidRef.current) {
        bootLog("profile load timeout deferred — account load still in flight");
        return;
      }
      setProfileReady((ready) => {
        if (!ready) bootLog("profile load timeout — marking ready");
        return true;
      });
    }, 10_000);

    return () => {
      effectCancelled = true;
      window.clearTimeout(bootFallback);
      window.clearTimeout(profileFallback);
      subscriptionManager.cleanup("auth:session");
    };
  }, [markSessionReady, scheduleLoadAccount]);

  /** Re-sync session after tab focus without extra auth listeners. */
  useEffect(() => {
    if (!isSupabaseBrowserConfigured) return;

    const reconnect = () => {
      if (document.visibilityState !== "visible" || reconnectBusyRef.current) return;
      const now = Date.now();
      if (now - lastReconnectAtRef.current < RECONNECT_COOLDOWN_MS) return;
      lastReconnectAtRef.current = now;
      reconnectBusyRef.current = true;
      void withTimeout(
        supabase.auth.getSession(),
        AUTH_SESSION_TIMEOUT_MS,
        "Session refresh timed out",
      )
        .then(({ data: { session: next } }) => {
          if (!mountedRef.current || !next) return;
          setSession(next);
          setUser((prev) => {
            const nu = next.user;
            if (!nu?.id) return prev ?? null;
            if (
              prev?.id === nu.id &&
              prev.email === nu.email &&
              prev.updated_at === nu.updated_at
            ) {
              return prev;
            }
            return nu;
          });
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
    subscriptionManager.register("auth:reconnect", () => {
      window.removeEventListener("focus", onFocus);
      document.removeEventListener("visibilitychange", onVisibility);
    });
    return () => {
      subscriptionManager.cleanup("auth:reconnect");
    };
  }, []);

  const signIn = useCallback(async (email: string, password: string) => {
    if (!isSupabaseBrowserConfigured) {
      return { error: "Supabase is not configured. Check VITE_SUPABASE_URL and VITE_SUPABASE_ANON_KEY in .env." };
    }
    try {
      for (let attempt = 0; attempt < 3; attempt++) {
        const { error } = await withTimeout(
          supabase.auth.signInWithPassword({ email, password }),
          AUTH_REQUEST_TIMEOUT_MS,
          "Sign in timed out",
        );
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
    clearPendingRole(user?.id);
    resetPostAuthRedirectState();
    accountAbortRef.current?.abort();
    try {
      await supabase.auth.signOut({ scope: "local" });
    } catch (e) {
      if (import.meta.env.DEV) console.warn("[AuthProvider] signOut", e);
    }
    if (!mountedRef.current) return;
    logAuth("signOut (user initiated)");
    sessionSnapshotRef.current = null;
    setAuthBootError(null);
    setSession(null);
    setUser(null);
    setRole(null);
    setPendingRoleState(null);
    setProfileFields({ full_name: null, phone: null });
    setHasGuardRow(false);
    setHasMerchantRow(false);
    setProfileReady(true);
    markSessionReady();
  }, [markSessionReady, user?.id]);

  const isGuardUser = role === "guard" || hasGuardRow || pendingRole === "guard";
  const isMerchantUser = role === "merchant" || hasMerchantRow || pendingRole === "merchant";

  const value = useMemo(
    () =>
      ({
        user,
        session,
        role,
        pendingRole,
        effectiveRole,
        setPendingRole,
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
      pendingRole,
      effectiveRole,
      setPendingRole,
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
