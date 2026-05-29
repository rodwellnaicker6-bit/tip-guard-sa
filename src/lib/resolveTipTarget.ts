import { QR_RESOLVE_TIMEOUT_MS, logFlow, withOperationTimeout } from "./operationTimeout";
import { perfMark } from "./perfTelemetry";
import { supabase } from "./supabase";
import { unwrapRpcSingle } from "./rpcData";
import { isValidTipToken } from "./nfc";
import { stabilLog } from "./stabilLog";
import { recordError } from "./errorTelemetry";
import { qrResolveErrorMessage, sanitizeUserFacingError } from "./userFacingErrors";

export type ResolvedTipTarget = {
  guard_id: string;
  location_id: string | null;
  merchant_id: string | null;
  guard_display_name: string;
  default_amount_cents: number | null;
  scan_count: number;
  qr_type?: string | null;
};

export type ResolveTipTargetResult = {
  target: ResolvedTipTarget | null;
  error: string | null;
};

const RESOLVE_CACHE_TTL_MS = 120_000;
const CACHE_KEY_PREFIX = "tipguard_resolve_";
const resolveMemCache = new Map<string, { at: number; value: ResolveTipTargetResult }>();
const resolveInflight = new Map<string, Promise<ResolveTipTargetResult>>();

const QR_TIMEOUT_OPTS = { queued: false as const };

function mapRow(row: Record<string, unknown>): ResolvedTipTarget | null {
  const guardId = row.guard_id as string | undefined;
  if (!guardId) return null;
  return {
    guard_id: guardId,
    location_id: (row.location_id as string | null) ?? null,
    merchant_id: (row.merchant_id as string | null) ?? null,
    guard_display_name: String(row.guard_display_name ?? "Guard"),
    default_amount_cents: (row.default_amount_cents as number | null) ?? null,
    scan_count: Number(row.scan_count ?? 0),
    qr_type: (row.qr_type as string | null) ?? null,
  };
}

function readCachedResolve(token: string): ResolveTipTargetResult | null {
  const mem = resolveMemCache.get(token);
  if (mem && Date.now() - mem.at < RESOLVE_CACHE_TTL_MS) return mem.value;

  if (typeof sessionStorage === "undefined") return null;
  try {
    const raw = sessionStorage.getItem(`${CACHE_KEY_PREFIX}${token}`);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as { at: number; value: ResolveTipTargetResult };
    if (Date.now() - parsed.at >= RESOLVE_CACHE_TTL_MS) {
      sessionStorage.removeItem(`${CACHE_KEY_PREFIX}${token}`);
      return null;
    }
    resolveMemCache.set(token, parsed);
    return parsed.value;
  } catch {
    return null;
  }
}

function writeCachedResolve(token: string, value: ResolveTipTargetResult): void {
  const entry = { at: Date.now(), value };
  resolveMemCache.set(token, entry);
  if (typeof sessionStorage === "undefined") return;
  try {
    sessionStorage.setItem(`${CACHE_KEY_PREFIX}${token}`, JSON.stringify(entry));
    if (value.target?.guard_display_name) {
      sessionStorage.setItem(`${CACHE_KEY_PREFIX}${token}:name`, value.target.guard_display_name);
    }
  } catch {
    /* ignore quota */
  }
}

/** Sync read for instant tip-page paint (warm NFC / repeat scan). */
export function peekCachedResolve(token: string | undefined): ResolveTipTargetResult | null {
  if (!token) return null;
  return readCachedResolve(token.trim());
}

/** Last-known resolve — used when network/RPC fails (up to 24h, public tip metadata only). */
function readStaleCachedResolve(token: string): ResolveTipTargetResult | null {
  const mem = resolveMemCache.get(token);
  if (mem?.value.target) return mem.value;
  if (typeof sessionStorage === "undefined") return null;
  try {
    const raw = sessionStorage.getItem(`${CACHE_KEY_PREFIX}${token}`);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as { at: number; value: ResolveTipTargetResult };
    const maxStaleMs = 24 * 60 * 60 * 1000;
    if (Date.now() - parsed.at > maxStaleMs) return null;
    return parsed.value?.target ? parsed.value : null;
  } catch {
    return null;
  }
}

/** Optimistic display name from prior resolve (no PII beyond public guard/venue label). */
export function readCachedTipDisplayName(token: string | undefined): string | null {
  if (!token || typeof sessionStorage === "undefined") return null;
  try {
    return sessionStorage.getItem(`${CACHE_KEY_PREFIX}${token.trim()}:name`);
  } catch {
    return null;
  }
}

/** Resolve QR/token to guard — uses `resolve_tip_target`, falls back to `resolve_tip_link` + guard row. */
export async function resolveTipTarget(token: string): Promise<ResolveTipTargetResult> {
  const trimmed = token.trim();
  if (!isValidTipToken(trimmed)) {
    stabilLog("qr", "resolve rejected invalid token format", { tokenLen: trimmed.length });
    recordError("qr_resolve", "invalid token format", { code: "token_format" });
    return { target: null, error: "This tip link is too short or invalid." };
  }

  const cached = readCachedResolve(trimmed);
  if (cached?.target) {
    stabilLog("qr", "resolve tip target cache hit", { tokenLen: trimmed.length });
    return cached;
  }

  const inflight = resolveInflight.get(trimmed);
  if (inflight) return inflight;

  const work = resolveTipTargetInner(trimmed);
  resolveInflight.set(trimmed, work);
  try {
    const result = await work;
    if (result.target) writeCachedResolve(trimmed, result);
    return result;
  } finally {
    resolveInflight.delete(trimmed);
  }
}

async function resolveTipTargetInner(trimmed: string): Promise<ResolveTipTargetResult> {
  const endPerf = perfMark("qr:resolve_tip_target");
  try {
    stabilLog("qr", "resolve tip target start", { tokenLen: trimmed.length });
    logFlow("qr", "resolveTipTarget", { tokenLen: trimmed.length });

    const { data, error: rpcErr } = await withOperationTimeout(
      "qr",
      "resolve_tip_target",
      (signal) => supabase.rpc("resolve_tip_target", { p_token: trimmed }).abortSignal(signal),
      QR_RESOLVE_TIMEOUT_MS,
      undefined,
      QR_TIMEOUT_OPTS,
    );
    const rpcSucceeded = !rpcErr;
    if (rpcSucceeded) {
      const row = Array.isArray(data)
        ? (data[0] as Record<string, unknown> | undefined)
        : data && typeof data === "object"
          ? (data as Record<string, unknown>)
          : undefined;
      const mapped = row ? mapRow(row) : null;
      if (mapped) {
        stabilLog("qr", "resolve tip target ok", { guardId: mapped.guard_id });
        void fireTouchAnalytics(trimmed);
        return { target: mapped, error: null };
      }
      return {
        target: null,
        error: qrResolveErrorMessage("invalid or expired"),
      };
    }

    const isMissingRpc =
      rpcErr?.message?.includes("Could not find the function") ||
      rpcErr?.code === "PGRST202";

    if (!isMissingRpc && rpcErr) {
      const stale = readStaleCachedResolve(trimmed);
      if (stale?.target) {
        stabilLog("qr", "resolve stale cache fallback after rpc error", { message: rpcErr.message });
        return stale;
      }
      return { target: null, error: qrResolveErrorMessage(rpcErr.message) };
    }

    const { data: linkData, error: linkErr } = await withOperationTimeout(
      "qr",
      "resolve_tip_link",
      (signal) => supabase.rpc("resolve_tip_link", { p_token: trimmed }).abortSignal(signal),
      QR_RESOLVE_TIMEOUT_MS,
      undefined,
      QR_TIMEOUT_OPTS,
    );
    if (linkErr) {
      return {
        target: null,
        error: qrResolveErrorMessage(linkErr.message),
      };
    }

    const guardId = unwrapRpcSingle<string>(linkData);
    if (!guardId) {
      return { target: null, error: qrResolveErrorMessage("invalid or expired") };
    }

    const { data: guard, error: gErr } = await withOperationTimeout(
      "qr",
      "guard lookup",
      (signal) =>
        supabase
          .from("guards")
          .select("id, display_name, verified, merchant_id, location_id")
          .eq("id", guardId)
          .abortSignal(signal)
          .maybeSingle(),
      QR_RESOLVE_TIMEOUT_MS,
      undefined,
      QR_TIMEOUT_OPTS,
    );

    if (gErr) return { target: null, error: qrResolveErrorMessage(gErr.message) };
    if (!guard?.id) {
      return {
        target: null,
        error: sanitizeUserFacingError("", "Guard profile not found for this link."),
      };
    }
    if (!guard.verified) {
      return {
        target: null,
        error: qrResolveErrorMessage("not verified for payments"),
      };
    }

    stabilLog("qr", "resolve tip target ok (fallback)", { guardId: guard.id });
    void fireTouchAnalytics(trimmed);
    return {
      target: {
        guard_id: guard.id,
        location_id: guard.location_id ?? null,
        merchant_id: guard.merchant_id ?? null,
        guard_display_name: String(guard.display_name ?? "Guard"),
        default_amount_cents: null,
        scan_count: 0,
      },
      error: null,
    };
  } catch (e) {
    const stale = readStaleCachedResolve(trimmed);
    if (stale?.target) {
      stabilLog("qr", "resolve stale cache fallback after error", {
        message: e instanceof Error ? e.message : String(e),
      });
      return stale;
    }
    const msg = e instanceof Error ? e.message : "Could not load this tip link.";
    stabilLog("qr", "resolveTipTarget failed", { message: msg });
    recordError("qr_resolve", msg, { code: "resolve_tip_target" });
    if (import.meta.env.DEV) console.error("[TipGuard:qr] resolveTipTarget failed", e);
    return { target: null, error: qrResolveErrorMessage(msg) };
  } finally {
    endPerf();
  }
}

function fireTouchAnalytics(trimmed: string): void {
  void Promise.allSettled([
    supabase.rpc("touch_tip_link", { p_token: trimmed }),
    supabase.rpc("touch_qr_code", { p_code_token: trimmed }),
  ]);
}
