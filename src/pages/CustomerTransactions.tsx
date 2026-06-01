import { useCallback, useEffect, useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { supabase } from "../lib/supabase";
import { zarFromCents } from "../lib/money";
import PageLoader from "../components/PageLoader";
import EmptyState from "../components/EmptyState";
import { FetchError } from "../components/FetchError";
import { TxStatusBadge } from "../components/TxStatusBadge";
import { GlassPanel } from "../components/fintech/GlassPanel";
import PaystackTestBanner from "../components/PaystackTestBanner";
import { useSupabaseQueryPage } from "../hooks/useSupabaseQueryPage";

type TxRow = {
  id: string;
  type: string;
  amount_cents: number;
  currency: string;
  status: string;
  paystack_reference: string | null;
  created_at: string;
};

function startOfDay(d: Date) {
  const x = new Date(d);
  x.setHours(0, 0, 0, 0);
  return x.getTime();
}

function endOfDay(d: Date) {
  const x = new Date(d);
  x.setHours(23, 59, 59, 999);
  return x.getTime();
}

export default function CustomerTransactions() {
  useSupabaseQueryPage("transaction-ledger");
  const [rows, setRows] = useState<TxRow[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [status, setStatus] = useState("");
  const [search, setSearch] = useState("");
  const [dateFrom, setDateFrom] = useState("");
  const [dateTo, setDateTo] = useState("");

  const load = useCallback(async () => {
    setLoading(true);
    const { data, error: qErr } = await supabase
      .from("transactions")
      .select("id, type, amount_cents, currency, status, paystack_reference, created_at")
      .order("created_at", { ascending: false })
      .limit(200);
    if (qErr) setError("Could not load transactions. Please try again.");
    else {
      setError(null);
      setRows((data as TxRow[]) ?? []);
    }
    setLoading(false);
  }, []);

  useEffect(() => {
    queueMicrotask(() => {
      void load();
    });
    const onVis = () => {
      if (document.visibilityState === "visible") void load();
    };
    document.addEventListener("visibilitychange", onVis);
    return () => document.removeEventListener("visibilitychange", onVis);
  }, [load]);

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    const fromTs = dateFrom ? startOfDay(new Date(dateFrom + "T12:00:00")) : null;
    const toTs = dateTo ? endOfDay(new Date(dateTo + "T12:00:00")) : null;
    return rows.filter((r) => {
      if (status && r.status !== status) return false;
      if (q) {
        const hay = `${r.paystack_reference ?? ""} ${r.type} ${r.status}`.toLowerCase();
        if (!hay.includes(q)) return false;
      }
      const t = new Date(r.created_at).getTime();
      if (fromTs != null && t < fromTs) return false;
      if (toTs != null && t > toTs) return false;
      return true;
    });
  }, [rows, status, search, dateFrom, dateTo]);

  if (loading && rows.length === 0) return <PageLoader />;

  return (
    <div className="shell dashboard-hub mx-auto max-w-lg space-y-4 px-4 py-8 pb-20 sm:px-5">
      <PaystackTestBanner />
      <header className="page-header fx-fade-up">
        <p className="muted-label">Ledger</p>
        <h2 className="font-black text-white">Your transactions</h2>
        <p className="mt-1 text-sm text-slate-400">Paystack-backed tips and wallet activity in ZAR.</p>
      </header>

      {error ? <FetchError message={error} onRetry={() => void load()} /> : null}

      <GlassPanel className="fx-fade-up space-y-3" glow="slate">
        <label className="block">
          <span className="text-xs font-semibold text-slate-500">Search</span>
          <input
            className="field tap-target mt-1"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Reference or status"
            aria-label="Search transactions"
          />
        </label>
        <label className="block">
          <span className="text-xs font-semibold text-slate-500">Status</span>
          <select className="field tap-target mt-1" value={status} onChange={(e) => setStatus(e.target.value)}>
            <option value="">All</option>
            <option value="pending">Pending</option>
            <option value="succeeded">Succeeded</option>
            <option value="failed">Failed</option>
          </select>
        </label>
        <div className="grid grid-cols-2 gap-2">
          <label className="block">
            <span className="text-xs font-semibold text-slate-500">From</span>
            <input className="field tap-target mt-1" type="date" value={dateFrom} onChange={(e) => setDateFrom(e.target.value)} />
          </label>
          <label className="block">
            <span className="text-xs font-semibold text-slate-500">To</span>
            <input className="field tap-target mt-1" type="date" value={dateTo} onChange={(e) => setDateTo(e.target.value)} />
          </label>
        </div>
        <p className="text-xs text-slate-500">
          Showing {filtered.length} of {rows.length}
          {loading ? " · refreshing…" : ""}
        </p>
      </GlassPanel>

      {filtered.length > 0 ? (
        <ul className="stack fx-fade-up" style={{ listStyle: "none", padding: 0, margin: 0, gap: 10 }}>
          {filtered.map((r) => (
            <li key={r.id} className="tx-row">
              <div className="min-w-0 flex-1">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <strong className="text-lg text-white">{zarFromCents(r.amount_cents)}</strong>
                  <TxStatusBadge status={r.status} />
                </div>
                <p className="mt-1 text-xs capitalize text-slate-500">{r.type.replace(/_/g, " ")}</p>
                <p className="mt-1 text-xs text-slate-500">{new Date(r.created_at).toLocaleString()}</p>
                {r.paystack_reference && (
                  <p className="mt-1 truncate font-mono text-[11px] text-amber-200/80">Ref {r.paystack_reference}</p>
                )}
              </div>
            </li>
          ))}
        </ul>
      ) : (
        !error && (
          <EmptyState
            title={rows.length === 0 ? "No transactions yet" : "No matches"}
            description={
              rows.length === 0
                ? "Complete a tip or wallet top-up to see entries here."
                : "Try clearing filters or widening the date range."
            }
            action={
              rows.length === 0 ? (
                <Link className="hub-primary-cta btn-gold tap-target" to="/customer/wallet">
                  Top up wallet
                </Link>
              ) : undefined
            }
          />
        )
      )}

      <div className="fx-fade-up grid grid-cols-2 gap-2 text-center text-sm font-semibold">
        <Link className="tap-target rounded-xl border border-white/10 py-3 text-amber-400" to="/customer/wallet">
          Wallet
        </Link>
        <Link className="tap-target rounded-xl border border-white/10 py-3 text-amber-400" to="/customer">
          Guards
        </Link>
      </div>
    </div>
  );
}
