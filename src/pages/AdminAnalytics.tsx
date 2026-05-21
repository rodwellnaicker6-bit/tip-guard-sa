import { useCallback, useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { zarFromCents } from "../lib/money";
import PageLoader from "../components/PageLoader";
import { isDemoMode } from "../lib/demoMode";
import { loadAdminPaymentAnalytics, type PaymentAnalytics } from "../lib/adminAnalyticsLoad";

export default function AdminAnalytics() {
  const [data, setData] = useState<PaymentAnalytics | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [source, setSource] = useState<"rpc" | "fallback" | "demo" | null>(null);
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    const result = await loadAdminPaymentAnalytics();
    setSource(result.source);
    if (result.data) {
      setData(result.data);
      setError(result.source === "fallback" && result.error ? null : result.error);
    } else {
      setData(null);
      setError(result.error ?? "Could not load analytics.");
    }
  }, []);

  useEffect(() => {
    let cancelled = false;
    void (async () => {
      await load();
      if (!cancelled) setLoading(false);
    })();
    return () => {
      cancelled = true;
    };
  }, [load]);

  if (loading) return <PageLoader />;

  return (
    <div className="shell mx-auto max-w-2xl space-y-5 px-5 py-8 pb-20">
      <header>
        <p className="text-xs font-bold uppercase tracking-wider text-slate-500">Payments</p>
        <h1 className="text-2xl font-black text-white">Payment analytics</h1>
        <p className="mt-1 text-sm text-slate-400">ZAR volume, QR scans, and top performers (SAST day boundaries).</p>
        {source === "demo" && isDemoMode && (
          <p className="mt-2 text-xs text-amber-400/90">Demo mode — presentation analytics.</p>
        )}
        {source === "fallback" && (
          <p className="mt-2 text-xs text-amber-400/80">
            Limited view — run <code className="text-amber-300">npm run db:push</code> for full admin_payment_analytics RPC.
          </p>
        )}
      </header>

      {error && <div className="error">{error}</div>}
      {!error && data && (
        <>
          <section className="grid gap-3 sm:grid-cols-2">
            <Stat label="Succeeded tips" value={String(data.tips_succeeded)} />
            <Stat label="Pending" value={String(data.tips_pending)} />
            <Stat label="Failed" value={String(data.tips_failed)} />
            <Stat label="Total volume" value={zarFromCents(data.volume_cents_succeeded)} />
            <Stat label="Today (SAST)" value={zarFromCents(data.revenue_today_cents)} />
            <Stat label="This week" value={zarFromCents(data.revenue_week_cents)} />
            <Stat label="QR scans" value={String(data.qr_scans_total)} />
            <Stat label="Ledger (ok / fail)" value={`${data.transactions_succeeded} / ${data.transactions_failed}`} />
          </section>

          <RankList title="Top guards" rows={data.top_guards ?? []} />
          <RankList title="Merchants by volume" rows={data.merchant_volume ?? []} />

          <section className="rounded-2xl border border-white/10 bg-white/[0.04] p-4">
            <h2 className="text-sm font-bold text-slate-200">Daily revenue (14 days)</h2>
            <ul className="mt-3 space-y-2 text-sm">
              {(data.daily_revenue ?? []).map((d) => (
                <li key={d.day} className="flex justify-between text-slate-400">
                  <span>{d.day}</span>
                  <span className="font-semibold text-amber-300">
                    {zarFromCents(d.volume_cents)} · {d.tip_count} tips
                  </span>
                </li>
              ))}
              {(data.daily_revenue ?? []).length === 0 && <li className="text-slate-500">No succeeded tips yet.</li>}
            </ul>
          </section>
        </>
      )}

      <div className="flex flex-wrap gap-4 text-sm font-semibold">
        <Link className="text-amber-400" to="/admin">
          Admin home
        </Link>
        <Link className="text-slate-500" to="/admin/transactions">
          Transactions
        </Link>
      </div>
    </div>
  );
}

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-2xl border border-white/10 bg-white/[0.04] p-4">
      <p className="text-xs font-semibold uppercase text-slate-500">{label}</p>
      <p className="mt-1 text-xl font-black text-white">{value}</p>
    </div>
  );
}

function RankList({
  title,
  rows,
}: {
  title: string;
  rows: { name: string; tip_count: number; volume_cents: number }[];
}) {
  return (
    <section className="rounded-2xl border border-white/10 bg-white/[0.04] p-4">
      <h2 className="text-sm font-bold text-slate-200">{title}</h2>
      <ul className="mt-3 space-y-2 text-sm">
        {rows.map((r) => (
          <li key={r.name} className="flex justify-between gap-2 text-slate-400">
            <span className="truncate text-slate-200">{r.name}</span>
            <span className="shrink-0 font-semibold text-amber-300">
              {zarFromCents(r.volume_cents)} · {r.tip_count}
            </span>
          </li>
        ))}
        {rows.length === 0 && <li className="text-slate-500">No data yet.</li>}
      </ul>
    </section>
  );
}
