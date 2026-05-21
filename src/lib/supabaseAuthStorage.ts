const HOST_MARKER = "tipguard_supabase_host";

function isStaleAuthStorageKey(key: string): boolean {
  if (key === HOST_MARKER) return false;
  if (key.startsWith("sb-")) return true;
  if (key.includes("-auth-token")) return true;
  return key.startsWith("tipguard-") && key.endsWith("-auth");
}

/** Clear Supabase auth tokens when the configured project host changes (stale session fix). */
export function reconcileSupabaseAuthStorage(supabaseUrl: string): void {
  if (typeof localStorage === "undefined") return;
  let host: string;
  try {
    host = new URL(supabaseUrl).host;
  } catch {
    return;
  }
  const prev = localStorage.getItem(HOST_MARKER);
  if (prev && prev !== host) {
    const keys = Object.keys(localStorage);
    for (const key of keys) {
      if (isStaleAuthStorageKey(key)) {
        localStorage.removeItem(key);
      }
    }
    if (import.meta.env.DEV) {
      console.info(`[TipGuard] Cleared stale auth storage (was ${prev}, now ${host}). Sign in again.`);
    }
  }
  localStorage.setItem(HOST_MARKER, host);
}
