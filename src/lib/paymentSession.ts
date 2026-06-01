import type { Session } from "@supabase/supabase-js";
import { logAuth } from "./authDebug";
import { logFlow } from "./operationTimeout";
import { isTransientNetworkError } from "./networkUtils";
import { qrAuthTimestamp } from "./qrAuthSession";
import { supabase } from "./supabase";

const REFRESH_BUFFER_SEC = 120;
const PAYMENT_AUTH_READ_MS = 8_000;
const PAYMENT_REFRESH_MS = 20_000;

/** Minimum JWT lifetime left before checkout triggers a refresh (avoids refresh storms on Pay). */
const CHECKOUT_MIN_JWT_MS = 90_000;

export type PaymentSessionResult =
  | { ok: true; accessToken: string; userId: string }
  | {
      ok: false;
      message: string;
      code: "not_signed_in" | "session_expired" | "network_timeout";
    };

/** React auth snapshot passed from QR/tip UI so Pay does not race getSession mid-refresh. */
export type PaymentSessionHint = {
  userId?: string | null;
  accessToken?: string | null;
  /** Caller already ran waitForStableSession — skip extra auth quiet waits. */
  sessionPrechecked?: boolean;
};

function sessionStillValid(session: Session | null | undefined): boolean {
  if (!session?.access_token || !session.user?.id) return false;
  if (session.expires_at == null) return true;
  return session.expires_at * 1000 > Date.now() + 30_000;
}

function jwtExpiresAtMs(accessToken: string): number | null {
  try {
    const payload = accessToken.split(".")[1];
    if (!payload) return null;
    const json = JSON.parse(atob(payload.replace(/-/g, "+").replace(/_/g, "/"))) as { exp?: number };
    return typeof json.exp === "number" ? json.exp * 1000 : null;
  } catch {
    return null;
  }
}

function accessTokenUsableForCheckout(accessToken: string): boolean {
  const exp = jwtExpiresAtMs(accessToken);
  if (exp == null) return true;
  return exp > Date.now() + CHECKOUT_MIN_JWT_MS;
}

function needsRefresh(session: Session): boolean {
  return (
    session.expires_at != null &&
    session.expires_at * 1000 < Date.now() + REFRESH_BUFFER_SEC * 1000
  );
}

async function readLocalSession(): Promise<Session | null> {
  const { data: { session }, error } = await supabase.auth.getSession();
  if (error) {
    console.warn("[TipGuard:pay] getSession error", error.message);
  }
  return session;
}

/** Local-first session read; never signs out — on slow IO retries without refresh. */
async function readSessionForPayment(): Promise<Session | null> {
  try {
    const raced = await Promise.race([
      readLocalSession().then((session) => ({ session, timedOut: false as const })),
      new Promise<{ session: null; timedOut: true }>((resolve) => {
        window.setTimeout(() => resolve({ session: null, timedOut: true }), PAYMENT_AUTH_READ_MS);
      }),
    ]);
    if (!raced.timedOut) return raced.session;
    logFlow("pay", "getSession slow — retrying local read");
    return readLocalSession();
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    logFlow("pay", "getSession failed — retrying", { message: msg });
    return readLocalSession();
  }
}

let refreshSessionPromise: Promise<Session | null> | null = null;

async function refreshSessionOnce(session: Session): Promise<Session | null> {
  if (!needsRefresh(session)) return session;

  if (refreshSessionPromise) {
    logFlow("pay", "awaiting in-flight refreshSession");
    return refreshSessionPromise;
  }

  refreshSessionPromise = (async () => {
    try {
      const refreshed = await Promise.race([
        supabase.auth.refreshSession(),
        new Promise<never>((_, reject) => {
          window.setTimeout(
            () => reject(new Error("refreshSession timed out")),
            PAYMENT_REFRESH_MS,
          );
        }),
      ]);
      if (refreshed.error) {
        console.warn("[TipGuard:pay] refreshSession failed", refreshed.error.message);
        if (sessionStillValid(session)) {
          logAuth("payment using existing JWT after refresh error", {
            message: refreshed.error.message,
          });
          return session;
        }
        return null;
      }
      return refreshed.data.session ?? session;
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      logFlow("pay", "refreshSession error", { message: msg });
      if (sessionStillValid(session)) {
        logAuth("payment using existing JWT after refresh timeout", { message: msg });
        return session;
      }
      return null;
    } finally {
      refreshSessionPromise = null;
    }
  })();

  return refreshSessionPromise;
}

function jwtStillValidForInvoke(accessToken: string): boolean {
  const exp = jwtExpiresAtMs(accessToken);
  if (exp == null) return true;
  return exp > Date.now() + 5_000;
}

function hintFastPath(hint?: PaymentSessionHint): PaymentSessionResult | null {
  const userId = hint?.userId?.trim();
  const accessToken = hint?.accessToken?.trim();
  if (!userId || !accessToken) return null;
  const okForCheckout = hint?.sessionPrechecked
    ? jwtStillValidForInvoke(accessToken)
    : accessTokenUsableForCheckout(accessToken);
  if (!okForCheckout) return null;
  logFlow("pay", "ensurePaymentAccessToken fast path (React JWT)", {
    userId,
    t: qrAuthTimestamp(),
    prechecked: !!hint?.sessionPrechecked,
  });
  return { ok: true, accessToken, userId };
}

/** Ensures a user JWT for payment Edge invokes. Never calls signOut; timeouts ≠ logout. */
export async function ensurePaymentAccessToken(
  hint?: PaymentSessionHint,
): Promise<PaymentSessionResult> {
  const fast = hintFastPath(hint);
  if (fast) return fast;

  logFlow("pay", "ensurePaymentAccessToken read session", {
    t: qrAuthTimestamp(),
    hasHint: Boolean(hint?.userId || hint?.accessToken),
    prechecked: !!hint?.sessionPrechecked,
  });

  try {
    let session = await readSessionForPayment();

    if (!session?.access_token && hint?.accessToken && hint?.userId) {
      session = {
        access_token: hint.accessToken,
        refresh_token: "",
        expires_in: 3600,
        expires_at: jwtExpiresAtMs(hint.accessToken)
          ? Math.floor(jwtExpiresAtMs(hint.accessToken)! / 1000)
          : Math.floor(Date.now() / 1000) + 3600,
        token_type: "bearer",
        user: { id: hint.userId } as Session["user"],
      } as Session;
      logAuth("payment using React hint after empty getSession", { userId: hint.userId });
    }

    if (!session?.access_token) {
      return {
        ok: false,
        message: "Please sign in to continue.",
        code: "not_signed_in",
      };
    }

    if (
      hint?.sessionPrechecked ||
      (needsRefresh(session) && accessTokenUsableForCheckout(session.access_token))
    ) {
      if (sessionStillValid(session)) {
        logFlow("pay", "skipping refresh — using JWT for checkout", {
          prechecked: !!hint?.sessionPrechecked,
        });
        return {
          ok: true,
          accessToken: session.access_token,
          userId: session.user!.id,
        };
      }
    }

    session = (await refreshSessionOnce(session)) ?? session;

    if (!sessionStillValid(session)) {
      logFlow("pay", "ensurePaymentAccessToken failed", { code: "session_expired" });
      return {
        ok: false,
        message: "Your session expired. Sign in again to pay.",
        code: "session_expired",
      };
    }

    logFlow("pay", "ensurePaymentAccessToken ok", {
      userId: session!.user!.id,
      t: qrAuthTimestamp(),
    });
    return {
      ok: true,
      accessToken: session!.access_token,
      userId: session!.user!.id,
    };
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    const transient = isTransientNetworkError(msg);
    logFlow("pay", "ensurePaymentAccessToken exception", { message: msg, transient });
    const fallback = await readLocalSession();
    if (sessionStillValid(fallback)) {
      logAuth("payment fallback to cached session after error", { message: msg });
      return {
        ok: true,
        accessToken: fallback!.access_token,
        userId: fallback!.user!.id,
      };
    }
    const hintRetry = hintFastPath(hint);
    if (hintRetry) return hintRetry;
    return {
      ok: false,
      message: transient
        ? "Connection issue. Check your network and try again."
        : "Could not verify your session. Try again without signing out.",
      code: transient ? "network_timeout" : "session_expired",
    };
  }
}
