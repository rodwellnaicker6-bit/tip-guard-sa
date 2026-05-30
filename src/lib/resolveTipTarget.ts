import { logFlow, qrResolveTimeoutMs, withOperationTimeout } from "./operationTimeout";
import { perfMark } from "./perfTelemetry";
import { supabase } from "./supabase";
import { unwrapRpcSingle } from "./rpcData";
import { isValidTipToken } from "./nfc";
import { stabilLog } from "./stabilLog";
import { recordError } from "./errorTelemetry";
import { type QrResolveFailureReason, qrResolveErrorMessage } from "./userFacingErrors";

/** Production-safe resolve diagnostics (always on; no tokens). */
function resolveLog(
  message: string,
  extra?: Record<string, unknown>,
  level: "info" | "warn" = "info",
): void {
  if (typeof console === "undefined") return;
  const payload = extra && Object.keys(extra).length > 0 ? extra : undefined;
  const line = `[TipGuard:resolve] ${message}`;
  if (level === "warn") console.warn(line, payload ?? "");
  else console.info(line, payload ?? "");
}

export type ResolvedTipTarget = {
  guard_id: string;
  location_id: string | null;
  merchant_id: string | null;
  guard_display_name: string;
  default_amount_cents: number | null;
  scan_count: number;
  qr_type?: string | null;
};

export type ResolveTipTargetDebug = {
  token: string;
  at: number;
  rowCount: number;
  rpcOk: boolean;
  rpcErrorCode?: string;
  guardId?: string;
  reason?: QrResolveFailureReason;
};

export type ResolveTipTargetResult = {
  target: ResolvedTipTarget | null;
  error: string | null;
  debug?: ResolveTipTargetDebug;
};

let lastResolveDebug: ResolveTipTargetDebug | null = null;

/** Last resolve snapshot for `?tg_resolve_debug=1` field support (no PII beyond public guard id). */
export function getLastResolveDebug(): ResolveTipTargetDebug | null {
  return lastResolveDebug;
}

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

/** Drop cached resolve for a token (retry after error / stale sessionStorage). */
export function clearResolveCacheForToken(token: string): void {
  const trimmed = token.trim();
  resolveMemCache.delete(trimmed);
  resolveInflight.delete(trimmed);
  if (typeof sessionStorage === "undefined") return;
  try {
    sessionStorage.removeItem(`${CACHE_KEY_PREFIX}${trimmed}`);
    sessionStorage.removeItem(`${CACHE_KEY_PREFIX}${trimmed}:name`);
  } catch {
    /* ignore */
  }
}

function shouldRetryResolve(result: ResolveTipTargetResult): boolean {
  if (result.target) return false;
  const reason = result.debug?.reason;
  if (reason === "timeout" || reason === "network" || reason === "empty_rpc") return true;
  const err = result.error?.toLowerCase() ?? "";
  return /timed out|timeout|failed to fetch|network|load this tip page|not active on tipguard/i.test(
    err,
  );
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
    resolveLog("rejected invalid token format", { tokenLen: trimmed.length }, "warn");
    stabilLog("qr", "resolve rejected invalid token format", { tokenLen: trimmed.length });
    recordError("qr_resolve", "invalid token format", { code: "token_format" });
    const err = qrResolveErrorMessage("", "invalid_token");
    lastResolveDebug = {
      token: trimmed,
      at: Date.now(),
      rowCount: 0,
      rpcOk: false,
      reason: "invalid_token",
    };
    return { target: null, error: err, debug: lastResolveDebug };
  }

  const cached = readCachedResolve(trimmed);
  if (cached?.target) {
    resolveLog("cache hit", { tokenLen: trimmed.length, guardId: cached.target.guard_id });
    stabilLog("qr", "resolve tip target cache hit", { tokenLen: trimmed.length });
    return cached;
  }

  const inflight = resolveInflight.get(trimmed);
  if (inflight) return inflight;

  const work = (async (): Promise<ResolveTipTargetResult> => {
    let result = await resolveTipTargetInner(trimmed);
    if (shouldRetryResolve(result)) {
      resolveLog("retry after miss", { tokenLen: trimmed.length }, "warn");
      clearResolveCacheForToken(trimmed);
      result = await resolveTipTargetInner(trimmed);
    }
    return result;
  })();
  resolveInflight.set(trimmed, work);
  try {
    const result = await work;
    if (result.target) {
      writeCachedResolve(trimmed, result);
      lastResolveDebug = result.debug ?? {
        token: trimmed,
        at: Date.now(),
        rowCount: 1,
        rpcOk: true,
        guardId: result.target.guard_id,
      };
    } else if (result.debug) {
      lastResolveDebug = result.debug;
    }
    return result;
  } finally {
    resolveInflight.delete(trimmed);
  }
}

function finishResolve(
  trimmed: string,
  rowCount: number,
  rpcOk: boolean,
  reason: QrResolveFailureReason,
  rpcErrorCode?: string,
  guardId?: string,
): ResolveTipTargetResult {
  const debug: ResolveTipTargetDebug = {
    token: trimmed,
    at: Date.now(),
    rowCount,
    rpcOk,
    rpcErrorCode,
    guardId,
    reason,
  };
  return {
    target: null,
    error: qrResolveErrorMessage("", reason),
    debug,
  };
}

async function resolveTipTargetInner(trimmed: string): Promise<ResolveTipTargetResult> {
  const endPerf = perfMark("qr:resolve_tip_target");
  const resolveTimeoutMs = qrResolveTimeoutMs();
  try {
    resolveLog("start", { tokenLen: trimmed.length });
    stabilLog("qr", "resolve tip target start", { tokenLen: trimmed.length });
    logFlow("qr", "resolveTipTarget", { tokenLen: trimmed.length });

    const { data, error: rpcErr } = await withOperationTimeout(
      "qr",
      "resolve_tip_target",
      (signal) => supabase.rpc("resolve_tip_target", { p_token: trimmed }).abortSignal(signal),
      resolveTimeoutMs,
      undefined,
      QR_TIMEOUT_OPTS,
    );
    const rpcSucceeded = !rpcErr;
    const rowCount = Array.isArray(data) ? data.length : data && typeof data === "object" ? 1 : 0;
    if (rpcSucceeded) {
      const row = Array.isArray(data)
        ? (data[0] as Record<string, unknown> | undefined)
        : data && typeof data === "object"
          ? (data as Record<string, unknown>)
          : undefined;
      const mapped = row ? mapRow(row) : null;
      if (mapped) {
        resolveLog("rpc ok", { guardId: mapped.guard_id, rowCount });
        stabilLog("qr", "resolve tip target ok", { guardId: mapped.guard_id });
        void fireTouchAnalytics(trimmed);
        const debug: ResolveTipTargetDebug = {
          token: trimmed,
          at: Date.now(),
          rowCount,
          rpcOk: true,
          guardId: mapped.guard_id,
        };
        return { target: mapped, error: null, debug };
      }
      resolveLog("rpc empty — inactive or expired", { rowCount }, "warn");
      return finishResolve(trimmed, rowCount, true, "empty_rpc");
    }

    const isMissingRpc =
      rpcErr?.message?.includes("Could not find the function") ||
      rpcErr?.code === "PGRST202";

    if (!isMissingRpc && rpcErr) {
      resolveLog("rpc error", { code: rpcErr.code, message: rpcErr.message }, "warn");
      const stale = readStaleCachedResolve(trimmed);
      if (stale?.target) {
        resolveLog("stale cache fallback after rpc error", { guardId: stale.target.guard_id });
        stabilLog("qr", "resolve stale cache fallback after rpc error", { message: rpcErr.message });
        return stale;
      }
      const reason: QrResolveFailureReason = /timed out|timeout/i.test(rpcErr.message ?? "")
        ? "timeout"
        : /failed to fetch|network/i.test(rpcErr.message ?? "")
          ? "network"
          : "unknown";
      return finishResolve(trimmed, rowCount, false, reason, rpcErr.code);
    }

    if (isMissingRpc) {
      resolveLog("resolve_tip_target missing — fallback chain", { code: rpcErr?.code }, "warn");
    }

    const { data: linkData, error: linkErr } = await withOperationTimeout(
      "qr",
      "resolve_tip_link",
      (signal) => supabase.rpc("resolve_tip_link", { p_token: trimmed }).abortSignal(signal),
      resolveTimeoutMs,
      undefined,
      QR_TIMEOUT_OPTS,
    );
    if (linkErr) {
      resolveLog("resolve_tip_link error", { message: linkErr.message }, "warn");
      const reason: QrResolveFailureReason = /timed out|timeout/i.test(linkErr.message ?? "")
        ? "timeout"
        : /failed to fetch|network/i.test(linkErr.message ?? "")
          ? "network"
          : "unknown";
      return finishResolve(trimmed, 0, false, reason, linkErr.code);
    }

    const guardId = unwrapRpcSingle<string>(linkData);
    if (!guardId) {
      resolveLog("fallback link empty", undefined, "warn");
      return finishResolve(trimmed, 0, true, "empty_rpc");
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
      resolveTimeoutMs,
      undefined,
      QR_TIMEOUT_OPTS,
    );

    if (gErr) {
      resolveLog("guard lookup error", { message: gErr.message }, "warn");
      const reason: QrResolveFailureReason = /timed out|timeout/i.test(gErr.message ?? "")
        ? "timeout"
        : /failed to fetch|network/i.test(gErr.message ?? "")
          ? "network"
          : "unknown";
      return finishResolve(trimmed, 0, false, reason, gErr.code);
    }
    if (!guard?.id) {
      resolveLog("guard row missing", { guardId }, "warn");
      return finishResolve(trimmed, 0, true, "empty_rpc");
    }
    if (!guard.verified) {
      resolveLog("guard not verified", { guardId: guard.id }, "warn");
      return finishResolve(trimmed, 0, true, "guard_unverified", undefined, guard.id);
    }

    resolveLog("fallback ok", { guardId: guard.id });
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
      resolveLog("stale cache fallback after exception", {
        guardId: stale.target.guard_id,
        message: e instanceof Error ? e.message : String(e),
      });
      stabilLog("qr", "resolve stale cache fallback after error", {
        message: e instanceof Error ? e.message : String(e),
      });
      return stale;
    }
    const msg = e instanceof Error ? e.message : "Could not load this tip link.";
    resolveLog("failed", { message: msg }, "warn");
    stabilLog("qr", "resolveTipTarget failed", { message: msg });
    recordError("qr_resolve", msg, { code: "resolve_tip_target" });
    if (import.meta.env.DEV) console.error("[TipGuard:qr] resolveTipTarget failed", e);
    const reason: QrResolveFailureReason = /timed out|timeout/i.test(msg)
      ? "timeout"
      : /failed to fetch|network/i.test(msg)
        ? "network"
        : "unknown";
    return finishResolve(trimmed, 0, false, reason);
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
