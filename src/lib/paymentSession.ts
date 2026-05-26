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

  let session = await read();

  const needsRefresh =
    session?.expires_at != null &&
    session.expires_at * 1000 < Date.now() + REFRESH_BUFFER_SEC * 1000;

  if (!session?.access_token || needsRefresh) {
    const { data: refreshed, error: refreshErr } = await supabase.auth.refreshSession();
    if (refreshErr) {
      console.warn("[TipGuard:pay] refreshSession failed", refreshErr.message);
    }
    session = refreshed.session ?? (await read());
  }

  if (!session?.access_token) {
    const { data: { user }, error: userErr } = await supabase.auth.getUser();
    if (userErr || !user?.id) {
      return { ok: false, message: "Please sign in again before paying.", code: "not_signed_in" };
    }
    session = await read();
  }

  if (!session?.access_token || !session.user?.id) {
    return { ok: false, message: "Please sign in again before paying.", code: "session_expired" };
  }

  return { ok: true, accessToken: session.access_token, userId: session.user.id };
}
