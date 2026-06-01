import { useCallback, useEffect, useState } from "react";
import type { Session } from "@supabase/supabase-js";
import { subscribeQrAuthSession } from "../lib/qrAuthSession";
import { ensureTipPayerSession } from "../lib/tipPayerSession";

type Options = {
  sessionReady: boolean;
  sessionUserId: string | null;
  session: Session | null;
};

/**
 * Ensures a payer JWT exists for QR/NFC tips without email signup.
 * Uses Supabase anonymous sign-in when no registered session is present.
 */
export function useGuestTipPayer({ sessionReady, sessionUserId, session }: Options) {
  const [guestUserId, setGuestUserId] = useState<string | null>(null);
  const [guestLoading, setGuestLoading] = useState(false);
  const [guestFailed, setGuestFailed] = useState(false);

  const ensureGuest = useCallback(async () => {
    if (sessionUserId) {
      setGuestUserId(null);
      setGuestFailed(false);
      setGuestLoading(false);
      return true;
    }
    setGuestLoading(true);
    setGuestFailed(false);
    const guest = await ensureTipPayerSession(session);
    setGuestLoading(false);
    if (guest) {
      setGuestUserId(guest.userId);
      return true;
    }
    setGuestFailed(true);
    return false;
  }, [session, sessionUserId]);

  useEffect(() => {
    if (!sessionReady || sessionUserId) return;
    void ensureGuest();
  }, [sessionReady, sessionUserId, ensureGuest]);

  useEffect(() => {
    if (sessionUserId) return;
    return subscribeQrAuthSession(() => {
      void ensureGuest();
    });
  }, [sessionUserId, ensureGuest]);

  const payerUserId = sessionUserId ?? guestUserId;
  const payerReady = Boolean(payerUserId);

  return {
    payerUserId,
    payerReady,
    guestLoading: guestLoading && !sessionUserId,
    guestFailed: guestFailed && !sessionUserId,
    ensureGuest,
  };
}
