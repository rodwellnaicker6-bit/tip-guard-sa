import { supabase } from "./supabase";
import { logAuth } from "./authDebug";

/** Re-read session when React auth state is briefly empty (TOKEN_REFRESHED race). */
export async function resolveAuthUserId(cachedUserId?: string | null): Promise<string | null> {
  if (cachedUserId) return cachedUserId;
  try {
    const { data: { session }, error } = await supabase.auth.getSession();
    if (error) {
      console.warn("[TipGuard:auth] resolveAuthUserId getSession", error.message);
    }
    const uid = session?.user?.id ?? null;
    if (uid) logAuth("resolveAuthUserId recovered session", { uid });
    return uid;
  } catch (e) {
    console.warn("[TipGuard:auth] resolveAuthUserId failed", e);
    return null;
  }
}
