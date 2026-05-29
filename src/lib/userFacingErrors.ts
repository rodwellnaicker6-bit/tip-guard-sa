import { LOG_VERBOSE } from "./prodLog";

const INTERNAL_PATTERNS = [
  /could not find the function/i,
  /pgrst202/i,
  /row-level security/i,
  /42501/,
  /permission denied/i,
  /migration/i,
  /supabase db push/i,
  /operator to run/i,
  /profile role cannot be changed/i,
  /violates.*constraint/i,
  /duplicate key/i,
];

/** Strip SQL/RPC/migration noise for end users; keep detail in dev or verbose mode. */
export function sanitizeUserFacingError(message: string, fallback: string): string {
  const trimmed = message.trim();
  if (!trimmed) return fallback;
  if (LOG_VERBOSE || import.meta.env.DEV) return trimmed;
  if (INTERNAL_PATTERNS.some((re) => re.test(trimmed))) return fallback;
  if (/^[\w\s.:,-]{0,120}$/.test(trimmed) && trimmed.length < 80) return trimmed;
  return fallback;
}

export function qrResolveErrorMessage(raw: string | null | undefined): string {
  const msg = raw?.trim() ?? "";
  if (/invalid.*expired|not verified|verified for payments/i.test(msg)) {
    return "This tip link is not available right now. Ask the venue to confirm their QR is active and their account is verified.";
  }
  if (/timed out|timeout|failed to fetch|network/i.test(msg)) {
    return "We could not load this tip page. Check your connection and try again.";
  }
  return sanitizeUserFacingError(
    msg,
    "This tip link is not available. The code may be inactive or the venue may still be setting up.",
  );
}

export function onboardingErrorMessage(message: string, code?: string): string {
  if (/profile role cannot be changed/i.test(message)) {
    return "We could not update your role for this account. Sign in with a fresh account or contact support.";
  }
  if (/permission denied|row-level security|42501/i.test(message)) {
    return "We could not save your profile (access denied). Try again or contact support.";
  }
  if (/network|fetch|failed to fetch|timeout/i.test(message)) {
    return "Network error while saving. Check your connection and try again.";
  }
  if (/profile row missing|not authenticated/i.test(message)) {
    return "Your account profile is still syncing. Wait a moment and tap Retry.";
  }
  const base = sanitizeUserFacingError(message, "We could not save your details. Please try again.");
  if (import.meta.env.DEV && (code || message)) {
    return `${base} [${code ?? "error"}: ${message}]`;
  }
  return base;
}
