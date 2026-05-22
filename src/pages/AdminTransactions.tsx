import { useCallback, useEffect, useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { supabase } from "../lib/supabase";
import { zarFromCents } from "../lib/money";
import PageLoader from "../components/PageLoader";
import EmptyState from "../components/EmptyState";
import { FetchError } from "../components/FetchError";

type TxRow = {
  id: string;
  user_id: string;
  type: string;
  amount_cents: number;
  currency: string;
  status: string;
  paystack_reference: string | null;
  metadata: Record<string, unknown> | null;
  created_at: string;
};

type ReconRow = {
  id: string;
  run_at: string;
  scope: string;
  matched_count: number;
  mismatch_count: number;
  details: Record<string, unknown> | null;
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

export default function AdminTransactions() {
  const [rows, setRows] = useState<TxRow[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [status, setStatus] = useState<string>("");
  const [type, setType] = useState<string>("");
  const [search, setSearch] = useState("");
  const [dateFrom, setDateFrom] = useState("");
  const [dateTo, setDateTo] = useState("");
  const [recon, setRecon] = useState<ReconRow[]>([]);
  const [payoutReport, setPayoutReport] = useState<Record<string, unknown> | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    const { data, error: qErr } = await supabase
      .from("transactions")
      .select("*")
      .order("created_at", { ascending: false })
      .limit(500);
    if (qErr) setError("Could not load transactions. Check admin RLS.");
    else {
      setError(null);
      setRows((data as TxRow[]) ?? []);
    }
    const { data: reconData } = await supabase
      .from("reconciliation_log")
      .select("id, run_at, scope, matched_count, mismatch_count, details")
      .order("run_at", { ascending: false })
      .limit(10);
    setRecon((reconData as ReconRow[]) ?? []);
    setLoading(false);
  }, []);

  const loadPayoutReport = useCallback(async () => {
    const day = new Date().toISOString().slice(0, 10);
    const { data, error: rpcErr } = await supabase.rpc("payout_reconciliation_report", { p_day: day });
    if (!rpcErr && data) setPayoutReport(data as Record<string, unknown>);
  }, []);

  useEffect(() => {
    queueMicrotask(() => {
      void load();
      void loadPayoutReport();
    });
  }, [load, loadPayoutReport]);

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    const fromTs = dateFrom ? startOfDay(new Date(dateFrom + "T12:00:00")) : null;
    const toTs = dateTo ? endOfDay(new Date(dateTo + "T12:00:00")) : null;
    return rows.filter((r) => {
      if (status && r.status !== status) return false;
      if (type && r.type !== type) return false;
      if (q) {
        const metaStr = JSON.stringify(r.metadata ?? {}).toLowerCase();
        const hay = `${r.paystack_reference ?? ""} ${r.user_id} ${r.type} ${r.status} ${metaStr}`.toLowerCase();
        if (!hay.includes(q)) return false;
      }
      const t = new Date(r.created_at).getTime();
      if (fromTs != null && t < fromTs) return false;
      if (toTs != null && t > toTs) return false;
      return true;
    });
  }, [rows, status, type, search, dateFrom, dateTo]);

  if (loading) return <PageLoader />;

  return (
    <div className="shell stack">
      <h2>Transactions</h2>
      <p style={{ color: "var(--muted)", fontSize: 14 }}>
        Paystack-backed ledger rows (tips, wallet top-ups, future subscriptions). Webhook updates status to succeeded or
        failed.
      </p>
      {error ? <FetchError message={error} onRetry={() => void load()} /> : null}
      <div className="stack mt" style={{ gap: 10 }}>
        <label>
          <span style={{ fontSize: 13, color: "var(--muted)" }}>Search</span>
          <input
            className="field mt"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="User id, ref, type, status, metadata"
            aria-label="Search transactions"
          />
        </label>
        <div className="row" style={{ gap: 12, flexWrap: "wrap", alignItems: "center" }}>
          <label>
            <span style={{ fontSize: 13, color: "var(--muted)" }}>Status</span>
            <select className="field mt" value={status} onChange={(e) => setStatus(e.target.value)}>
              <option value="">All</option>
              <option value="pending">pending</option>
              <option value="succeeded">succeeded</option>
              <option value="failed">failed</option>
            </select>
          </label>
          <label>
            <span style={{ fontSize: 13, color: "var(--muted)" }}>Type</span>
            <select className="field mt" value={type} onChange={(e) => setType(e.target.value)}>
              <option value="">All</option>
              <option value="tip">tip</option>
              <option value="wallet_topup">wallet_topup</option>
              <option value="subscription">subscription</option>
            </select>
          </label>
        </div>
        <div className="row" style={{ gap: 10, flexWrap: "wrap" }}>
          <label style={{ flex: "1 1 140px" }}>
            <span style={{ fontSize: 13, color: "var(--muted)" }}>From</span>
            <input className="field mt" type="date" value={dateFrom} onChange={(e) => setDateFrom(e.target.value)} />
          </label>
          <label style={{ flex: "1 1 140px" }}>
            <span style={{ fontSize: 13, color: "var(--muted)" }}>To</span>
            <input className="field mt" type="date" value={dateTo} onChange={(e) => setDateTo(e.target.value)} />
          </label>
        </div>
      </div>
      <p style={{ fontSize: 13, color: "var(--muted)", margin: 0 }}>
        Showing {filtered.length} of {rows.length} loaded
      </p>
      <div className="table-scroll stack mt">
        {filtered.length > 0 ? (
          <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 14 }}>
            <thead>
              <tr style={{ textAlign: "left", borderBottom: "1px solid var(--border)" }}>
                <th style={{ padding: "8px 6px" }}>When</th>
                <th style={{ padding: "8px 6px" }}>User</th>
                <th style={{ padding: "8px 6px" }}>Type</th>
                <th style={{ padding: "8px 6px" }}>Amount</th>
                <th style={{ padding: "8px 6px" }}>Status</th>
                <th style={{ padding: "8px 6px" }}>Reference</th>
              </tr>
            </thead>
            <tbody>
              {filtered.map((r) => (
                <tr key={r.id} style={{ borderBottom: "1px solid var(--border)" }}>
                  <td style={{ padding: "8px 6px", whiteSpace: "nowrap" }}>{new Date(r.created_at).toLocaleString()}</td>
                  <td style={{ padding: "8px 6px", fontFamily: "monospace", fontSize: 12 }}>{r.user_id.slice(0, 8)}…</td>
                  <td style={{ padding: "8px 6px" }}>{r.type}</td>
                  <td style={{ padding: "8px 6px" }}>{zarFromCents(r.amount_cents)}</td>
                  <td style={{ padding: "8px 6px" }}>{r.status}</td>
                  <td style={{ padding: "8px 6px", fontFamily: "monospace", fontSize: 11 }}>
                    {r.paystack_reference ?? "—"}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        ) : (
          !error && (
            <EmptyState
              title={rows.length === 0 ? "No transactions loaded" : "No rows match"}
              description={
                rows.length === 0
                  ? "No ledger rows returned — check RLS and admin access."
                  : "Clear filters or widen the date range."
              }
            />
          )
        )}
      </div>
      <section className="stack mt" style={{ marginTop: 24 }}>
        <h3 style={{ fontSize: 16, margin: 0 }}>Payout reconciliation (today)</h3>
        <p style={{ color: "var(--muted)", fontSize: 13, margin: 0 }}>
          RPC <code>payout_reconciliation_report(day)</code> — sample in docs/RECONCILIATION.md.
        </p>
        {payoutReport ? (
          <pre
            style={{
              fontSize: 11,
              overflow: "auto",
              padding: 12,
              borderRadius: 12,
              border: "1px solid var(--border)",
              maxHeight: 200,
            }}
          >
            {JSON.stringify(payoutReport, null, 2)}
          </pre>
        ) : (
          <p style={{ fontSize: 13, color: "var(--muted)" }}>No payout report (apply migration).</p>
        )}
      </section>
      <section className="stack mt" style={{ marginTop: 24 }}>
        <h3 style={{ fontSize: 16, margin: 0 }}>Reconciliation log</h3>
        <p style={{ color: "var(--muted)", fontSize: 13, margin: 0 }}>
          Batch runs from <code>reconcile-daily</code> / <code>paystack-reconcile</code>. See docs/RECONCILIATION.md and docs/CRON.md.
        </p>
        {recon.length === 0 ? (
          <p style={{ fontSize: 13, color: "var(--muted)" }}>No reconciliation_log rows yet.</p>
        ) : (
          <ul className="stack" style={{ gap: 8, listStyle: "none", padding: 0 }}>
            {recon.map((r) => (
              <li
                key={r.id}
                style={{
                  border: "1px solid var(--border)",
                  borderRadius: 12,
                  padding: "10px 12px",
                  fontSize: 13,
                }}
              >
                <strong>{r.scope}</strong> · {new Date(r.run_at).toLocaleString()}
                <br />
                matched {r.matched_count} · mismatch {r.mismatch_count}
              </li>
            ))}
          </ul>
        )}
      </section>
      <Link to="/admin">Admin home</Link>
    </div>
  );
}
