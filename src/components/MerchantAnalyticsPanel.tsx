import { useCallback, useEffect, useState } from "react";
import { supabase } from "../lib/supabase";
import { zarFromCents } from "../lib/money";
import { Skeleton } from "./Skeleton";
import { FetchError } from "./FetchError";
import { downloadCsv } from "../lib/exportCsv";

type Analytics = {
  period?: string;
  tips_succeeded?: number;
  volume_cents_succeeded?: number;
  commission_cents?: number;
  guards_count?: number;
  locations_count?: number;
  guard_leaderboard?: { name: string; tip_count: number; volume_cents: number }[];
  live_feed?: { id: string; guard_name: string; amount_cents: number; status: string; created_at: string }[];
};

const PERIODS = [
  { id: "24h", label: "24h" },
  { id: "7d", label: "7d" },
  { id: "30d", label: "30d" },
  { id: "all", label: "All" },
] as const;

export function MerchantAnalyticsPanel() {
  const [period, setPeriod] = useState<(typeof PERIODS)[number]["id"]>("30d");
  const [data, setData] = useState<Analytics | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    const { data: raw, error: err } = await supabase.rpc("merchant_payment_analytics_v2", { p_period: period });
    if (err) {
      setError(err.message);
      setData(null);
    } else {
      setData((raw as Analytics) ?? null);
    }
    setLoading(false);
  }, [period]);

  useEffect(() => {
    let cancelled = false;
    const run = async () => {
      setLoading(true);
      setError(null);
      const { data: raw, error: err } = await supabase.rpc("merchant_payment_analytics_v2", { p_period: period });
      if (cancelled) return;
      if (err) {
        setError(err.message);
        setData(null);
      } else {
        setData((raw as Analytics) ?? null);
      }
      setLoading(false);
    };
    queueMicrotask(() => {
      void run();
    });
    const id = setInterval(() => {
      if (document.visibilityState === "visible") void run();
    }, 30_000);
    return () => {
      cancelled = true;
      clearInterval(id);
    };
  }, [period]);

  if (loading && !data) {
    return (
      <div className="space-y-3">
        <Skeleton style={{ height: 80, width: "100%", borderRadius: 16 }} />
        <Skeleton style={{ height: 120, width: "100%", borderRadius: 16 }} />
      </div>
    );
  }

  if (error) {
    return <FetchError message={error} onRetry={() => void load()} retryLabel="Reload analytics" />;
  }

  if (!data) return null;

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap gap-2">
        {PERIODS.map((p) => (
          <button
            key={p.id}
            type="button"
            className={`tap-target rounded-xl px-3 py-2 text-xs font-bold ${
              period === p.id ? "bg-amber-500/25 text-amber-200" : "bg-white/5 text-slate-400"
            }`}
            onClick={() => setPeriod(p.id)}
          >
            {p.label}
          </button>
        ))}
      </div>

      {(data.guard_leaderboard ?? []).length > 0 ? (
        <button
          type="button"
          className="tap-target w-full rounded-xl border border-white/15 py-2 text-xs font-semibold text-amber-300"
          onClick={() =>
            downloadCsv(
              `tipguard-merchant-${period}-${new Date().toISOString().slice(0, 10)}.csv`,
              (data.guard_leaderboard ?? []).map((g) => ({
                guard: g.name,
                tip_count: g.tip_count,
                volume_zar: ((g.volume_cents ?? 0) / 100).toFixed(2),
              })),
            )
          }
        >
          Export leaderboard CSV
        </button>
      ) : null}

      <div className="grid grid-cols-2 gap-3">
        <Stat label="Tips" value={String(data.tips_succeeded ?? 0)} />
        <Stat label="Volume" value={zarFromCents(data.volume_cents_succeeded ?? 0)} />
        <Stat label="Guards" value={String(data.guards_count ?? 0)} />
        <Stat label="Commission" value={zarFromCents(data.commission_cents ?? 0)} />
      </div>

      <div className="card rounded-2xl border border-white/10 bg-white/[0.04] p-4">
        <strong className="text-slate-200">Guard leaderboard</strong>
        {(data.guard_leaderboard ?? []).length === 0 ? (
          <p className="mt-2 text-sm text-slate-500">No succeeded tips in this period.</p>
        ) : (
          <ul className="mt-2 space-y-2 text-sm">
            {(data.guard_leaderboard ?? []).map((g) => (
              <li key={g.name} className="flex justify-between gap-2">
                <span className="text-slate-300">{g.name}</span>
                <span className="font-mono text-amber-300/90">
                  {zarFromCents(g.volume_cents)} · {g.tip_count}
                </span>
              </li>
            ))}
          </ul>
        )}
      </div>

      <div className="card rounded-2xl border border-white/10 bg-white/[0.04] p-4">
        <strong className="text-slate-200">Live feed</strong>
        <p className="text-xs text-slate-500">Polls every 30s when this tab is visible.</p>
        <ul className="mt-2 max-h-48 space-y-2 overflow-y-auto text-xs">
          {(data.live_feed ?? []).map((row) => (
            <li key={row.id} className="flex justify-between gap-2 border-b border-white/5 pb-1">
              <span className="text-slate-400">{row.guard_name}</span>
              <span>
                {zarFromCents(row.amount_cents)} · {row.status}
              </span>
            </li>
          ))}
        </ul>
      </div>
    </div>
  );
}

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-xl border border-white/10 bg-white/[0.04] p-3">
      <p className="text-[10px] font-bold uppercase text-slate-500">{label}</p>
      <p className="mt-1 text-lg font-black text-amber-300">{value}</p>
    </div>
  );
}
