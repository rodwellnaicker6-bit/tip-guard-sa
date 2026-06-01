import type { Session } from "@supabase/supabase-js";
import { logAuth } from "./authDebug";
import { stabilLog } from "./stabilLog";
import { isSupabaseBrowserConfigured, supabase } from "./supabase";
import { withTimeout } from "./asyncTimeout";

const ANON_SIGN_IN_MS = 8_000;

export type TipPayerSession = { userId: string; accessToken: string };

/** Returns an authenticated payer JWT for tip checkout (existing session or anonymous). */
export async function ensureTipPayerSession(
  knownSession?: Session | null,
): Promise<TipPayerSession | null> {
  if (!isSupabaseBrowserConfigured) return null;

  const live = knownSession ?? (await supabase.auth.getSession()).data.session;
  if (live?.user?.id && live.access_token) {
    return { userId: live.user.id, accessToken: live.access_token };
  }

  try {
    const { data, error } = await withTimeout(
      supabase.auth.signInAnonymously(),
      ANON_SIGN_IN_MS,
      "Guest sign-in timed out",
    );
    if (error) {
      stabilLog("pay", "anonymous tip sign-in failed", { message: error.message });
      return null;
    }
    const session = data.session;
    if (!session?.user?.id || !session.access_token) return null;
    logAuth("tip payer anonymous session", { uid: session.user.id });
    return { userId: session.user.id, accessToken: session.access_token };
  } catch (e) {
    stabilLog("pay", "anonymous tip sign-in exception", {
      message: e instanceof Error ? e.message : String(e),
    });
    return null;
  }
}
