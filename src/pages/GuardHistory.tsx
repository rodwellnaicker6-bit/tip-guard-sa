import { useCallback, useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { supabase } from "../lib/supabase";
import { useAuth } from "../context/useAuth";
import { zarFromCents } from "../lib/money";
import PageLoader from "../components/PageLoader";
import EmptyState from "../components/EmptyState";
import { FetchError } from "../components/FetchError";
import { TxStatusBadge } from "../components/TxStatusBadge";
import { GlassPanel } from "../components/fintech/GlassPanel";

type TipRow = {
  id: string;
  amount_cents: number;
  status: string;
  created_at: string;
  payer_id: string | null;
};

const PAGE_SIZE = 50;

export default function GuardHistory() {
  const { user } = useAuth();
  const [tips, setTips] = useState<TipRow[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [loadingMore, setLoadingMore] = useState(false);
  const [hasMore, setHasMore] = useState(false);
  const [reload, setReload] = useState(0);
  const [guardId, setGuardId] = useState<string | null>(null);

  const loadPage = useCallback(
    async (gid: string, offset: number, append: boolean) => {
      const { data, error: tErr } = await supabase
        .from("tips")
        .select("id, amount_cents, status, created_at, payer_id")
        .eq("guard_id", gid)
        .order("created_at", { ascending: false })
        .range(offset, offset + PAGE_SIZE - 1);
      if (tErr) {
        setError("Could not load tip history. Please try again.");
        return;
      }
      const batch = (data as TipRow[]) ?? [];
      setError(null);
      setHasMore(batch.length === PAGE_SIZE);
      setTips((prev) => (append ? [...prev, ...batch] : batch));
    },
    [],
  );

  useEffect(() => {
    if (!user?.id) return;
    let cancelled = false;
    (async () => {
      setLoading(true);
      setError(null);
      const { data: g, error: gErr } = await supabase.from("guards").select("id").eq("user_id", user.id).maybeSingle();
      if (cancelled) return;
      if (gErr || !g?.id) {
        setError(gErr?.message ?? "Guard profile not found.");
        setLoading(false);
        return;
      }
      setGuardId(g.id);
      await loadPage(g.id, 0, false);
      if (!cancelled) setLoading(false);
    })();
    return () => {
      cancelled = true;
    };
  }, [user?.id, reload, loadPage]);

  async function loadMore() {
    if (!guardId || loadingMore || !hasMore) return;
    setLoadingMore(true);
    await loadPage(guardId, tips.length, true);
    setLoadingMore(false);
  }

  if (loading && tips.length === 0) return <PageLoader />;

  return (
    <div className="shell dashboard-hub mx-auto max-w-lg space-y-4 px-4 py-8 pb-[max(4rem,env(safe-area-inset-bottom))] sm:px-5">
      <header className="page-header fx-fade-up">
        <p className="muted-label">Earnings</p>
        <h2 className="font-black text-white">Tip history</h2>
        <p className="mt-1 text-sm text-slate-400">Succeeded tips credit your wallet after Paystack settlement.</p>
      </header>

      {error ? <FetchError message={error} onRetry={() => setReload((n) => n + 1)} /> : null}

      {tips.length > 0 ? (
        <ul className="stack fx-fade-up" style={{ listStyle: "none", padding: 0, margin: 0, gap: 10 }}>
          {tips.map((t) => (
            <li key={t.id} className="tx-row">
              <div className="min-w-0 flex-1">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <strong className="text-lg text-white">{zarFromCents(t.amount_cents)}</strong>
                  <TxStatusBadge status={t.status} />
                </div>
                <p className="mt-1 text-xs text-slate-500">{new Date(t.created_at).toLocaleString()}</p>
              </div>
            </li>
          ))}
        </ul>
      ) : (
        !error && (
          <EmptyState
            title="No tips yet"
            description="Share your QR link so customers can tip you."
            action={
              <Link className="hub-primary-cta btn-gold tap-target" to="/guard/qr">
                Open QR links
              </Link>
            }
          />
        )
      )}

      {hasMore && !error ? (
        <button
          type="button"
          className="tap-target w-full rounded-xl border border-white/15 py-3 text-sm font-semibold text-amber-300 disabled:opacity-50"
          disabled={loadingMore}
          onClick={() => void loadMore()}
        >
          {loadingMore ? "Loading…" : "Load more"}
        </button>
      ) : null}

      <GlassPanel className="fx-fade-up text-center text-sm" glow="slate">
        <Link className="font-semibold text-amber-400" to="/guard">
          ← Dashboard
        </Link>
      </GlassPanel>
    </div>
  );
}
