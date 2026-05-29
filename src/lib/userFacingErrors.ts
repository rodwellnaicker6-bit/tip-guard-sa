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

const QR_RESOLVE_USER_PREFIXES = [
  "This QR code is not active on TipGuard",
  "This tip link is not available right now",
  "This tip link is not available. The code may be inactive",
  "We could not load this tip page",
  "This tip link is too short or invalid",
  "This guard is not verified for tips yet",
  "This venue has not finished setup on TipGuard",
] as const;

/** Structured resolve failures — passed from `resolveTipTarget` (not shown raw to users). */
export type QrResolveFailureReason =
  | "empty_rpc"
  | "timeout"
  | "network"
  | "guard_unverified"
  | "venue_inactive"
  | "invalid_token"
  | "unknown";

const QR_REASON_MESSAGES: Record<QrResolveFailureReason, string> = {
  empty_rpc:
    "This QR code is not active on TipGuard. Ask the venue for a new printed code, or confirm their account and QR are still set up.",
  timeout:
    "We could not load this tip page in time. Your connection may be slow on mobile — wait a moment and tap Try again.",
  network:
    "We could not reach TipGuard. Check mobile data or Wi‑Fi, then tap Try again.",
  guard_unverified:
    "This guard is not verified for tips yet. Ask the venue to complete guard verification.",
  venue_inactive:
    "This venue has not finished setup on TipGuard. The business account must be verified before this QR can accept tips.",
  invalid_token: "This tip link is too short or invalid.",
  unknown:
    "This tip link is not available. The code may be inactive or the venue may still be setting up.",
};

/** True when `msg` is already a final QR resolve string (avoid double-wrapping in UI). */
export function isQrResolveUserMessage(msg: string): boolean {
  const t = msg.trim();
  return QR_RESOLVE_USER_PREFIXES.some((p) => t.startsWith(p));
}

function inferQrResolveReason(raw: string): QrResolveFailureReason | null {
  if (/invalid.*expired|empty.*row|no.*row|not active on tipguard/i.test(raw)) return "empty_rpc";
  if (/not verified|verified for payments/i.test(raw)) return "guard_unverified";
  if (/venue.*setup|merchant.*verified|business account/i.test(raw)) return "venue_inactive";
  if (/timed out|timeout/i.test(raw)) return "timeout";
  if (/failed to fetch|network|load failed|aborterror/i.test(raw)) return "network";
  if (/too short|invalid token/i.test(raw)) return "invalid_token";
  return null;
}

export function qrResolveErrorMessage(
  raw: string | null | undefined,
  reason?: QrResolveFailureReason,
): string {
  if (reason) return QR_REASON_MESSAGES[reason];
  const msg = raw?.trim() ?? "";
  if (isQrResolveUserMessage(msg)) return msg;
  const inferred = inferQrResolveReason(msg);
  if (inferred) return QR_REASON_MESSAGES[inferred];
  if (import.meta.env.DEV && msg) {
    return `${QR_REASON_MESSAGES.unknown} [dev: ${msg.slice(0, 120)}]`;
  }
  return sanitizeUserFacingError(msg, QR_REASON_MESSAGES.unknown);
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
