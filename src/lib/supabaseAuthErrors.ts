/** Maps Supabase Auth / fetch failures to UI-friendly strings (avoids bare "Load failed"). */

const NETWORK_HINT =
  " Check VITE_SUPABASE_URL and VITE_SUPABASE_ANON_KEY in .env, your network, and Supabase Dashboard → Authentication → URL Configuration (Site URL and Redirect URLs must match this app’s origin).";

const REDIRECT_HINT =
  " In Supabase Dashboard → Authentication → URL Configuration, add this app’s `/auth/callback` URL to Redirect URLs (signup uses emailRedirectTo there).";

function readMessage(error: unknown): string {
  if (typeof error === "object" && error !== null && "message" in error) {
    const m = (error as { message: unknown }).message;
    if (typeof m === "string" && m.trim()) return m.trim();
  }
  return String(error);
}

function readStatus(error: unknown): number | undefined {
  if (typeof error === "object" && error !== null && "status" in error) {
    const s = (error as { status: unknown }).status;
    if (typeof s === "number" && !Number.isNaN(s)) return s;
  }
  return undefined;
}

function looksLikeNetworkFailure(message: string): boolean {
  const m = message.toLowerCase();
  return (
    m === "load failed" ||
    m.includes("failed to fetch") ||
    m.includes("networkerror") ||
    m.includes("network request failed") ||
    m.includes("fetch failed")
  );
}

function looksLikeRedirectDisallowed(message: string): boolean {
  const m = message.toLowerCase();
  return (
    (m.includes("redirect") && (m.includes("not allowed") || m.includes("invalid") || m.includes("disallowed"))) ||
    m.includes("email link is invalid") ||
    (m.includes("bad request") && m.includes("redirect"))
  );
}

/**
 * Prefer GoTrue / AuthError `message`, append HTTP status when useful, and add
 * short operator hints for generic browser fetch errors.
 */
export function formatAuthUserFacingError(error: unknown): string {
  const message = readMessage(error);
  const status = readStatus(error);

  let out = message;
  if (status !== undefined) {
    if (status === 0) {
      out = `${message} (request did not reach Supabase — wrong URL, offline, or blocked)`;
    } else {
      out = `${message} (HTTP ${status})`;
    }
  }

  if (looksLikeNetworkFailure(message)) {
    out = `${out}.${NETWORK_HINT}`;
  } else if (looksLikeRedirectDisallowed(message)) {
    out = `${out}.${REDIRECT_HINT}`;
  }

  return out;
}
