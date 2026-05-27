import { useCallback, useEffect, useRef, useState } from "react";
import { useAuth } from "../context/useAuth";
import { VENUE_LOAD_TIMEOUT_MS, withOperationTimeout } from "../lib/operationTimeout";
import { perfLog } from "../lib/perfLog";
import { supabase } from "../lib/supabase";
import { fetchEntityPayoutPrefs, type PayoutSchedule } from "../lib/payoutSchedule";
import { isMissingColumnError, logVenue } from "../lib/venueDebug";

export type MerchantVenueRow = {
  id: string;
  business_name: string;
  location: string | null;
  verified: boolean;
  risk_score?: number;
};

type VenueCacheEntry = {
  at: number;
  row: MerchantVenueRow | null;
};

const CACHE_TTL_MS = 90_000;
const venueCache = new Map<string, VenueCacheEntry>();
const inflight = new Map<string, Promise<MerchantVenueRow | null>>();

const CORE_COLS = "id, business_name, location, verified";
const FULL_COLS = `${CORE_COLS}, risk_score`;

async function queryMerchantRow(userId: string): Promise<{ row: MerchantVenueRow | null; error: Error | null }> {
  const t0 = performance.now();
  try {
    let { data, error } = await withOperationTimeout(
      "venue",
      "merchants select",
      (signal) =>
        supabase.from("merchants").select(FULL_COLS).eq("user_id", userId).abortSignal(signal).maybeSingle(),
      VENUE_LOAD_TIMEOUT_MS,
    );

    if (error && isMissingColumnError(error)) {
      logVenue("risk_score column missing — retrying core select", { code: error.code });
      const retry = await withOperationTimeout(
        "venue",
        "merchants core select",
        (signal) =>
          supabase.from("merchants").select(CORE_COLS).eq("user_id", userId).abortSignal(signal).maybeSingle(),
        VENUE_LOAD_TIMEOUT_MS,
      );
      data = retry.data as typeof data;
      error = retry.error;
    }

    logVenue("merchants select end", {
      ms: Math.round(performance.now() - t0),
      ok: !error,
      hasRow: !!data?.id,
      code: error?.code,
    });
    perfLog("venue merchants select", Math.round(performance.now() - t0), { ok: !error });

    if (error) {
      return { row: null, error: new Error(error.message) };
    }
    return { row: (data as MerchantVenueRow | null) ?? null, error: null };
  } catch (e) {
    perfLog("venue merchants select timeout", Math.round(performance.now() - t0));
    return { row: null, error: e instanceof Error ? e : new Error(String(e)) };
  }
}

export async function fetchMerchantVenueForUser(userId: string): Promise<{
  row: MerchantVenueRow | null;
  error: Error | null;
}> {
  const cached = venueCache.get(userId);
  if (cached && Date.now() - cached.at < CACHE_TTL_MS) {
    logVenue("cache hit", { userId });
    return { row: cached.row, error: null };
  }

  let p = inflight.get(userId);
  if (!p) {
    p = (async () => {
      const result = await queryMerchantRow(userId);
      inflight.delete(userId);
      if (result.error) throw result.error;
      venueCache.set(userId, { at: Date.now(), row: result.row });
      return result.row;
    })();
    inflight.set(userId, p);
  }

  try {
    const row = await p;
    return { row, error: null };
  } catch (e) {
    return { row: null, error: e instanceof Error ? e : new Error(String(e)) };
  }
}

export function invalidateMerchantVenueCache(userId?: string): void {
  if (userId) venueCache.delete(userId);
  else venueCache.clear();
}

export type MerchantVenueLoadState = {
  merchant: MerchantVenueRow | null;
  loading: boolean;
  error: string | null;
  errorCode: string | null;
  payoutSchedule: PayoutSchedule;
  nextPayoutAt: string | null;
  minPayoutCents: number;
  payoutSchemaComplete: boolean;
  reload: () => void;
};

export function useMerchantVenue(): MerchantVenueLoadState {
  const { user, sessionReady } = useAuth();
  const [merchant, setMerchant] = useState<MerchantVenueRow | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [errorCode, setErrorCode] = useState<string | null>(null);
  const [reloadToken, setReloadToken] = useState(0);
  const [payoutSchedule, setPayoutSchedule] = useState<PayoutSchedule>("weekly");
  const [nextPayoutAt, setNextPayoutAt] = useState<string | null>(null);
  const [minPayoutCents, setMinPayoutCents] = useState(10000);
  const [payoutSchemaComplete, setPayoutSchemaComplete] = useState(true);
  const loadGenRef = useRef(0);

  const reload = useCallback(() => {
    if (user?.id) invalidateMerchantVenueCache(user.id);
    setReloadToken((n) => n + 1);
  }, [user]);

  useEffect(() => {
    if (!sessionReady) return;

    const gen = ++loadGenRef.current;
    let cancelled = false;
    const uid = user?.id;

    if (!uid) {
      queueMicrotask(() => {
        if (gen !== loadGenRef.current) return;
        setLoading(false);
        setMerchant(null);
        setError(null);
      });
      return;
    }

    logVenue("load start", { uid, sessionReady, reloadToken });

    const watchdog = window.setTimeout(() => {
      if (cancelled || gen !== loadGenRef.current) return;
      setLoading(false);
      setError((prev) => prev ?? "Venue load timed out. Please try again.");
    }, VENUE_LOAD_TIMEOUT_MS + 1_000);

    void (async () => {
      setLoading(true);
      setError(null);
      setErrorCode(null);

      const t0 = performance.now();
      const [{ row, error: venueErr }, payoutLoad] = await Promise.all([
        fetchMerchantVenueForUser(uid),
        fetchEntityPayoutPrefs("merchants", uid),
      ]);

      if (cancelled || gen !== loadGenRef.current) return;

      logVenue("load end", {
        ms: Math.round(performance.now() - t0),
        hasRow: !!row,
        payoutError: payoutLoad.error,
      });

      if (venueErr) {
        const msg = venueErr.message;
        setError(
          import.meta.env.DEV
            ? `We could not load your venue. ${msg}`
            : "We could not load your venue. Please try again.",
        );
        setErrorCode("venue_fetch");
        setMerchant(null);
      } else {
        setMerchant(row);
        setError(null);
        setErrorCode(null);
      }

      if (payoutLoad.prefs) {
        setPayoutSchedule(payoutLoad.prefs.schedule);
        setNextPayoutAt(payoutLoad.prefs.nextPayoutAt);
        setMinPayoutCents(payoutLoad.prefs.minCents);
        setPayoutSchemaComplete(payoutLoad.prefs.schemaComplete);
      }

      setLoading(false);
    })();

    return () => {
      cancelled = true;
      window.clearTimeout(watchdog);
    };
  }, [user?.id, sessionReady, reloadToken]);

  return {
    merchant,
    loading: loading || !sessionReady,
    error,
    errorCode,
    payoutSchedule,
    nextPayoutAt,
    minPayoutCents,
    payoutSchemaComplete,
    reload,
  };
}
