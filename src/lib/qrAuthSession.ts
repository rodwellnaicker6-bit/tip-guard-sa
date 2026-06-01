import { supabase } from "./supabase";
import { logAuth } from "./authDebug";
import { stabilLog } from "./stabilLog";

/** Match RequireAuth / Onboarding — avoid login redirect during TOKEN_REFRESHED null window. */
export const QR_AUTH_GRACE_MS = 3_500;

/** Quiet period after last auth event before pay / edge invoke. */
export const QR_SESSION_STABLE_QUIET_MS = 300;

/** Hold pay while TOKEN_REFRESHED may still be settling in React. */
export const QR_TOKEN_REFRESH_SETTLE_MS = 400;

const POLL_MS = 200;

/** ISO timestamp for qr-auth / pay timeline logs. */
export function qrAuthTimestamp(): string {
  return new Date().toISOString();
}

let tokenRefreshInFlight = false;
let lastAuthEventAt = 0;
let lastAuthEvent: string | null = null;
let refreshSettleTimer: number | null = null;
let authListenerStarted = false;
const sessionListeners = new Set<() => void>();

function notifySessionListeners(): void {
  for (const fn of sessionListeners) {
    try {
      fn();
    } catch {
      /* ignore */
    }
  }
}

function markAuthEvent(event: string): void {
  lastAuthEventAt = Date.now();
  lastAuthEvent = event;
  logQrAuth("auth event", { event, t: qrAuthTimestamp() });

  if (event === "SIGNED_OUT") {
    tokenRefreshInFlight = false;
    if (refreshSettleTimer) {
      window.clearTimeout(refreshSettleTimer);
      refreshSettleTimer = null;
    }
    notifySessionListeners();
    return;
  }

  if (event === "TOKEN_REFRESHED") {
    tokenRefreshInFlight = true;
    notifySessionListeners();
    if (refreshSettleTimer) window.clearTimeout(refreshSettleTimer);
    refreshSettleTimer = window.setTimeout(() => {
      tokenRefreshInFlight = false;
      refreshSettleTimer = null;
      logQrAuth("token refresh settled", { t: qrAuthTimestamp() });
      notifySessionListeners();
    }, QR_TOKEN_REFRESH_SETTLE_MS);
  }
}

/** Single auth listener for QR pay timing (TOKEN_REFRESHED in-flight tracking). */
export function ensureQrAuthSessionListener(): void {
  if (authListenerStarted || typeof window === "undefined") return;
  authListenerStarted = true;
  supabase.auth.onAuthStateChange((event) => {
    markAuthEvent(event);
  });
}

/** Re-render when refresh-in-flight or settle state changes (QrTipLanding Pay disabled). */
export function subscribeQrAuthSession(listener: () => void): () => void {
  ensureQrAuthSessionListener();
  sessionListeners.add(listener);
  return () => {
    sessionListeners.delete(listener);
  };
}

export function isTokenRefreshInFlight(): boolean {
  ensureQrAuthSessionListener();
  return tokenRefreshInFlight;
}

export function logQrAuth(message: string, extra?: Record<string, unknown>): void {
  stabilLog("qr-auth", message, { t: qrAuthTimestamp(), ...extra });
}

function sleep(ms: number): Promise<void> {
  return new Promise((r) => window.setTimeout(r, ms));
}

/** True while auth is hydrating, session missing within grace, or TOKEN_REFRESHED settling. */
export function isSessionRestoreInFlight(
  sessionReady: boolean,
  sessionMissing: boolean,
  sessionGraceElapsed: boolean,
): boolean {
  ensureQrAuthSessionListener();
  if (!sessionReady) return true;
  if (tokenRefreshInFlight) return true;
  if (sessionMissing && !sessionGraceElapsed) return true;
  const sinceEvent = Date.now() - lastAuthEventAt;
  if (lastAuthEvent && sinceEvent < QR_SESSION_STABLE_QUIET_MS) return true;
  return false;
}

export type StableSessionResult =
  | { ok: true; userId: string; waitedMs: number }
  | {
      ok: false;
      reason: "timeout" | "not_signed_in" | "session_not_ready";
      waitedMs: number;
    };

/**
 * Block pay / Paystack init until session hydration finished, no TOKEN_REFRESHED in flight,
 * and auth events have been quiet. Never signs out.
 */
export async function waitForStableSession(opts?: {
  sessionReady?: boolean;
  reactUserId?: string | null;
  reactSessionUserId?: string | null;
  maxMs?: number;
  /** Pay / wallet: trust React or getSession when JWT exists; skip auth-event quiet wait. */
  forPayment?: boolean;
}): Promise<StableSessionResult> {
  ensureQrAuthSessionListener();
  const t0 = Date.now();
  const maxMs = opts?.maxMs ?? QR_AUTH_GRACE_MS + 2_000;
  const deadline = t0 + maxMs;

  logQrAuth("waitForStableSession start", {
    sessionReady: opts?.sessionReady ?? null,
    refreshInFlight: tokenRefreshInFlight,
    lastAuthEvent,
    forPayment: !!opts?.forPayment,
  });

  if (opts?.forPayment) {
    const reactUid = opts.reactUserId ?? opts.reactSessionUserId ?? null;
    if (reactUid) {
      const waitedMs = Date.now() - t0;
      logQrAuth("waitForStableSession ok (payment react)", { userId: reactUid, waitedMs });
      return { ok: true, userId: reactUid, waitedMs };
    }
    try {
      const { data: { session } } = await supabase.auth.getSession();
      const uid = session?.user?.id ?? null;
      if (uid) {
        const waitedMs = Date.now() - t0;
        logQrAuth("waitForStableSession ok (payment getSession)", { userId: uid, waitedMs });
        return { ok: true, userId: uid, waitedMs };
      }
    } catch {
      /* continue to poll */
    }
  }

  while (Date.now() < deadline) {
    if (opts?.sessionReady === false) {
      await sleep(POLL_MS);
      continue;
    }

    if (tokenRefreshInFlight) {
      await sleep(POLL_MS);
      continue;
    }

    const sinceEvent = Date.now() - lastAuthEventAt;
    if (
      !opts?.forPayment &&
      lastAuthEvent &&
      sinceEvent < QR_SESSION_STABLE_QUIET_MS
    ) {
      await sleep(POLL_MS);
      continue;
    }

    const reactUid = opts?.reactUserId ?? opts?.reactSessionUserId ?? null;
    if (reactUid) {
      const waitedMs = Date.now() - t0;
      logQrAuth("waitForStableSession ok (react)", { userId: reactUid, waitedMs });
      return { ok: true, userId: reactUid, waitedMs };
    }

    try {
      const { data: { session }, error } = await supabase.auth.getSession();
      if (error) {
        logQrAuth("waitForStableSession getSession error", { message: error.message });
      }
      const uid = session?.user?.id ?? null;
      if (uid && (opts?.forPayment || !tokenRefreshInFlight)) {
        const waitedMs = Date.now() - t0;
        logQrAuth("waitForStableSession ok (getSession)", { userId: uid, waitedMs });
        return { ok: true, userId: uid, waitedMs };
      }
    } catch (e) {
      logQrAuth("waitForStableSession getSession exception", {
        message: e instanceof Error ? e.message : String(e),
      });
    }

    await sleep(POLL_MS);
  }

  const waitedMs = Date.now() - t0;
  if (opts?.sessionReady === false) {
    logQrAuth("waitForStableSession failed", { reason: "session_not_ready", waitedMs });
    return { ok: false, reason: "session_not_ready", waitedMs };
  }

  try {
    const { data: { session } } = await supabase.auth.getSession();
    if (!session?.user?.id) {
      logQrAuth("waitForStableSession failed", { reason: "not_signed_in", waitedMs });
      return { ok: false, reason: "not_signed_in", waitedMs };
    }
  } catch {
    /* fall through */
  }

  logQrAuth("waitForStableSession failed", { reason: "timeout", waitedMs });
  return { ok: false, reason: "timeout", waitedMs };
}

/**
 * Resolves payer user id: React state first, then polls getSession through grace,
 * then one refresh attempt. Never signs out.
 */
export async function resolvePaymentUserId(
  reactUserId?: string | null,
  reactSessionUserId?: string | null,
): Promise<string | null> {
  const stable = await waitForStableSession({
    reactUserId,
    reactSessionUserId,
    maxMs: QR_AUTH_GRACE_MS,
  });
  if (stable.ok) return stable.userId;

  const immediate = reactUserId ?? reactSessionUserId ?? null;
  if (immediate) return immediate;

  logQrAuth("resolvePaymentUserId: React user null — polling getSession", {});
  const deadline = Date.now() + QR_AUTH_GRACE_MS;
  while (Date.now() < deadline) {
    if (tokenRefreshInFlight) {
      await sleep(POLL_MS);
      continue;
    }
    try {
      const { data: { session }, error } = await supabase.auth.getSession();
      if (error) {
        logQrAuth("getSession poll error", { message: error.message });
      }
      const uid = session?.user?.id ?? null;
      if (uid) {
        logAuth("QR resolvePaymentUserId recovered during grace", { uid });
        logQrAuth("session recovered during grace", { uid });
        return uid;
      }
    } catch (e) {
      logQrAuth("getSession poll exception", { message: e instanceof Error ? e.message : String(e) });
    }
    await sleep(POLL_MS);
  }

  try {
    logQrAuth("grace elapsed — attempting refreshSession", {});
    const { data: { session }, error } = await supabase.auth.refreshSession();
    if (error) {
      logQrAuth("refreshSession after grace failed", { message: error.message });
    }
    const uid = session?.user?.id ?? null;
    if (uid) {
      logAuth("QR resolvePaymentUserId recovered after refresh", { uid });
      logQrAuth("session recovered after refresh", { uid });
      return uid;
    }
  } catch (e) {
    logQrAuth("refreshSession exception", { message: e instanceof Error ? e.message : String(e) });
  }

  try {
    const { data: { session } } = await supabase.auth.getSession();
    const uid = session?.user?.id ?? null;
    if (uid) {
      logQrAuth("session recovered on final getSession", { uid });
      return uid;
    }
  } catch {
    /* ignore */
  }

  logQrAuth("confirmed no session after grace + refresh", {});
  return null;
}

/** True only when grace polling + refresh could not find a user — safe to send to /login. */
export async function confirmRequiresSignInForPayment(opts?: {
  knownUserId?: string | null;
  knownAccessToken?: string | null;
}): Promise<boolean> {
  const knownUid = opts?.knownUserId?.trim();
  const knownJwt = opts?.knownAccessToken?.trim();
  if (knownUid && knownJwt) {
    logQrAuth("confirmRequiresSignInForPayment skipped — caller JWT", { knownUid });
    return false;
  }
  const uid = await resolvePaymentUserId(knownUid ?? null, knownUid ?? null);
  const signedOut = !uid;
  logQrAuth("confirmRequiresSignInForPayment", { signedOut });
  return signedOut;
}
