import { useCallback, useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { supabase } from "../lib/supabase";
import { zarFromCents } from "../lib/money";
import PageLoader from "../components/PageLoader";

type OpsMetrics = {
  tips_today?: number;
  volume_cents_today?: number;
  failed_webhooks?: number;
  dlq_size?: number;
  reconciliation_mismatches_7d?: number;
  pending_webhook_retries?: number;
  open_disputes?: number;
};

export default function AdminMetrics() {
  const [metrics, setMetrics] = useState<OpsMetrics | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [ready, setReady] = useState(false);

  const load = useCallback(async () => {
    const { data, error: rpcErr } = await supabase.rpc("admin_ops_metrics");
    if (rpcErr) setError(rpcErr.message);
    else {
      setError(null);
      setMetrics((data as OpsMetrics) ?? null);
    }
  }, []);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      await load();
      if (!cancelled) setReady(true);
    })();
    return () => {
      cancelled = true;
    };
  }, [load]);

  if (!ready) return <PageLoader />;

  const cards = [
    { label: "Tips today", value: String(metrics?.tips_today ?? 0) },
    { label: "Volume today", value: zarFromCents(Number(metrics?.volume_cents_today ?? 0)) },
    { label: "Failed webhooks", value: String(metrics?.failed_webhooks ?? 0) },
    { label: "DLQ size", value: String(metrics?.dlq_size ?? 0) },
    { label: "Recon mismatches (7d)", value: String(metrics?.reconciliation_mismatches_7d ?? 0) },
    { label: "Pending retries", value: String(metrics?.pending_webhook_retries ?? 0) },
    { label: "Open disputes", value: String(metrics?.open_disputes ?? 0) },
  ];

  return (
    <div className="shell mx-auto max-w-2xl space-y-5 px-5 py-8 pb-20">
      <header>
        <p className="text-xs font-bold uppercase tracking-wider text-slate-500">Operations</p>
        <h1 className="text-2xl font-black text-white">Production metrics</h1>
        {error && <p className="mt-1 text-sm text-amber-400">{error}</p>}
      </header>
      <div className="grid gap-3 sm:grid-cols-2">
        {cards.map((c) => (
          <div key={c.label} className="rounded-2xl border border-white/10 bg-white/5 p-4">
            <p className="text-xs font-bold uppercase text-slate-500">{c.label}</p>
            <p className="mt-1 text-xl font-black text-amber-400">{c.value}</p>
          </div>
        ))}
      </div>
      <div className="flex flex-col gap-2 sm:flex-row">
        <Link className="rounded-xl border border-white/10 py-3 text-center text-sm font-semibold text-amber-400" to="/admin/fraud">
          Fraud & DLQ
        </Link>
        <Link className="rounded-xl border border-white/10 py-3 text-center text-sm font-semibold text-amber-400" to="/admin">
          Admin hub
        </Link>
      </div>
    </div>
  );
}
