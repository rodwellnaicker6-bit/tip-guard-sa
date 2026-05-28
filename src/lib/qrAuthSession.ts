import { supabase } from "./supabase";
import { logAuth } from "./authDebug";
import { stabilLog } from "./stabilLog";

/** Match RequireAuth / Onboarding — avoid login redirect during TOKEN_REFRESHED null window. */
export const QR_AUTH_GRACE_MS = 3_500;

const POLL_MS = 200;

export function logQrAuth(message: string, extra?: Record<string, unknown>): void {
  stabilLog("qr-auth", message, extra);
}

function sleep(ms: number): Promise<void> {
  return new Promise((r) => window.setTimeout(r, ms));
}

/**
 * Resolves payer user id: React state first, then polls getSession through grace,
 * then one refresh attempt. Never signs out.
 */
export async function resolvePaymentUserId(
  reactUserId?: string | null,
  reactSessionUserId?: string | null,
): Promise<string | null> {
  const immediate = reactUserId ?? reactSessionUserId ?? null;
  if (immediate) return immediate;

  logQrAuth("resolvePaymentUserId: React user null — polling getSession", {});
  const deadline = Date.now() + QR_AUTH_GRACE_MS;
  while (Date.now() < deadline) {
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
export async function confirmRequiresSignInForPayment(): Promise<boolean> {
  const uid = await resolvePaymentUserId(null, null);
  const signedOut = !uid;
  logQrAuth("confirmRequiresSignInForPayment", { signedOut });
  return signedOut;
}
