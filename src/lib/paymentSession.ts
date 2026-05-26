import { PAYMENT_SESSION_TIMEOUT_MS, logFlow, withOperationTimeout } from "./operationTimeout";
import { supabase } from "./supabase";

const REFRESH_BUFFER_SEC = 120;

export type PaymentSessionResult =
  | { ok: true; accessToken: string; userId: string }
  | { ok: false; message: string; code: "not_signed_in" | "session_expired" };

/** Ensures a user JWT is available for payment Edge invokes (not anon/publishable key). */
export async function ensurePaymentAccessToken(): Promise<PaymentSessionResult> {
  const read = async () => {
    const { data: { session }, error } = await supabase.auth.getSession();
    if (error) {
      console.warn("[TipGuard:pay] getSession error", error.message);
    }
    return session;
  };

  let session = await withOperationTimeout("pay", "getSession", read(), PAYMENT_SESSION_TIMEOUT_MS);

  const needsRefresh =
    session?.expires_at != null &&
    session.expires_at * 1000 < Date.now() + REFRESH_BUFFER_SEC * 1000;

  if (!session?.access_token || needsRefresh) {
    const { data: refreshed, error: refreshErr } = await withOperationTimeout(
      "pay",
      "refreshSession",
      supabase.auth.refreshSession(),
      PAYMENT_SESSION_TIMEOUT_MS,
    );
    if (refreshErr) {
      console.warn("[TipGuard:pay] refreshSession failed", refreshErr.message);
    }
    session = refreshed.session ?? (await withOperationTimeout("pay", "getSession retry", read(), PAYMENT_SESSION_TIMEOUT_MS));
  }

  if (!session?.access_token) {
    const { data: { user }, error: userErr } = await withOperationTimeout(
      "pay",
      "getUser",
      supabase.auth.getUser(),
      PAYMENT_SESSION_TIMEOUT_MS,
    );
    if (userErr || !user?.id) {
      return { ok: false, message: "Please sign in again before paying.", code: "not_signed_in" };
    }
    session = await withOperationTimeout("pay", "getSession after getUser", read(), PAYMENT_SESSION_TIMEOUT_MS);
  }

  if (!session?.access_token || !session.user?.id) {
    logFlow("pay", "ensurePaymentAccessToken failed", { code: "session_expired" });
    return { ok: false, message: "Please sign in again before paying.", code: "session_expired" };
  }

  logFlow("pay", "ensurePaymentAccessToken ok", { userId: session.user.id });
  return { ok: true, accessToken: session.access_token, userId: session.user.id };
}
