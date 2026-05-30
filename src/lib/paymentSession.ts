import type { Session } from "@supabase/supabase-js";
import { logAuth } from "./authDebug";
import { logFlow } from "./operationTimeout";
import { isTransientNetworkError } from "./networkUtils";
import { QR_AUTH_GRACE_MS, qrAuthTimestamp, waitForStableSession } from "./qrAuthSession";
import { supabase } from "./supabase";

const REFRESH_BUFFER_SEC = 120;
const PAYMENT_AUTH_READ_MS = 8_000;
const PAYMENT_REFRESH_MS = 20_000;

export type PaymentSessionResult =
  | { ok: true; accessToken: string; userId: string }
  | {
      ok: false;
      message: string;
      code: "not_signed_in" | "session_expired" | "network_timeout";
    };

function sessionStillValid(session: Session | null | undefined): boolean {
  if (!session?.access_token || !session.user?.id) return false;
  if (session.expires_at == null) return true;
  return session.expires_at * 1000 > Date.now() + 30_000;
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

async function refreshSessionIfNeeded(session: Session): Promise<Session | null> {
  if (!needsRefresh(session)) return session;

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
  }
}

/** Ensures a user JWT for payment Edge invokes. Never calls signOut; timeouts ≠ logout. */
export async function ensurePaymentAccessToken(): Promise<PaymentSessionResult> {
  const stableWait = await waitForStableSession({ forPayment: true, maxMs: QR_AUTH_GRACE_MS + 2_000 });
  logFlow("pay", "ensurePaymentAccessToken stable wait", {
    ok: stableWait.ok,
    reason: stableWait.ok ? undefined : stableWait.reason,
    waitedMs: stableWait.waitedMs,
    t: qrAuthTimestamp(),
  });

  try {
    let session = await readSessionForPayment();

    if (!session?.access_token) {
      return {
        ok: false,
        message: "Please sign in to continue.",
        code: "not_signed_in",
      };
    }

    session = (await refreshSessionIfNeeded(session)) ?? session;

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
      stableWaitMs: stableWait.waitedMs,
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
    return {
      ok: false,
      message: transient
        ? "Connection issue. Check your network and try again."
        : "Could not verify your session. Try again without signing out.",
      code: transient ? "network_timeout" : "session_expired",
    };
  }
}
