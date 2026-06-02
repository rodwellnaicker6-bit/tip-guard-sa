import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { RPC_DEFAULT_TIMEOUT_MS, withOperationTimeout } from "../lib/operationTimeout";
import { supabase } from "../lib/supabase";
import { useAuth } from "../context/useAuth";
import { zarFromCents } from "../lib/money";
import PageLoader from "../components/PageLoader";
import EmptyState from "../components/EmptyState";
import { FetchError } from "../components/FetchError";
import { SlowLoadHint } from "../components/SlowLoadHint";
import { useUiWatchdog } from "../lib/uiWatchdog";
import { useSupabaseQueryPage } from "../hooks/useSupabaseQueryPage";

type TipHistoryRow = {
  id: string;
  amount_cents: number;
  status: string;
  created_at: string;
  guard_display_name: string;
};

export default function CustomerHistory() {
  useSupabaseQueryPage("transaction-history");
  const { user, sessionReady } = useAuth();
  const [tips, setTips] = useState<TipHistoryRow[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [reload, setReload] = useState(0);
  const slowLoad = useUiWatchdog(loading);

  useEffect(() => {
    if (!sessionReady || !user?.id) return;
    let cancelled = false;
    (async () => {
      setLoading(true);
      setError(null);
      try {
        const { data, error: tErr } = await withOperationTimeout(
          "dashboard",
          "get_customer_tip_history",
          (signal) => supabase.rpc("get_customer_tip_history").abortSignal(signal),
          RPC_DEFAULT_TIMEOUT_MS,
          undefined,
          { queued: false },
        );
        if (cancelled) return;
        if (tErr) {
          setError("Could not load tip history. Please try again.");
          setTips([]);
        } else {
          setTips((data as TipHistoryRow[]) ?? []);
        }
      } catch {
        if (!cancelled) setError("Loading timed out. Please try again.");
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [user?.id, sessionReady, reload]);

  if (loading && tips.length === 0 && !error) {
    return (
      <div className="shell dashboard-hub stack">
        <PageLoader />
        <SlowLoadHint show={slowLoad} />
      </div>
    );
  }

  return (
    <div className="shell dashboard-hub stack">
      <header className="page-header fx-fade-up">
        <p className="muted-label">History</p>
        <h2 className="font-black text-white">Your tips</h2>
        <p className="mt-1 text-sm text-slate-400">Tips you sent to verified guards.</p>
      </header>

      {error ? <FetchError message={error} onRetry={() => setReload((n) => n + 1)} /> : null}

      {!loading && !error && tips.length === 0 ? (
        <EmptyState
          title="No tips sent yet"
          description="When you tip a guard, it will show up here with amount and status."
          action={
            <Link className="hub-primary-cta btn-gold tap-target" to="/customer">
              Find a guard
            </Link>
          }
        />
      ) : null}

      <div className="stack mt min-w-0">
        {tips.map((t) => (
          <div key={t.id} className="card stack min-w-0">
            <div className="row" style={{ justifyContent: "space-between", flexWrap: "wrap", gap: 8 }}>
              <strong className="min-w-0 truncate" style={{ color: "var(--text)" }}>
                {t.guard_display_name ?? "Guard"}
              </strong>
              <span className="shrink-0">{zarFromCents(t.amount_cents)}</span>
            </div>
            <p style={{ fontSize: 12 }}>
              {new Date(t.created_at).toLocaleString()} · {t.status}
            </p>
          </div>
        ))}
      </div>

      <nav className="hub-nav-grid">
        <Link className="hub-nav-link text-amber-400" to="/customer/wallet">
          Wallet
        </Link>
        <Link className="hub-nav-link text-amber-400" to="/customer">
          Browse guards
        </Link>
        <Link className="hub-nav-link text-slate-300" to="/customer/dashboard">
          Dashboard
        </Link>
      </nav>
    </div>
  );
}
