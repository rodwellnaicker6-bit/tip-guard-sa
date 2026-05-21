import { useEffect, useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { supabase } from "../lib/supabase";
import { zarFromCents } from "../lib/money";
import PageLoader from "../components/PageLoader";
import EmptyState from "../components/EmptyState";

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

  useEffect(() => {
    let cancelled = false;
    (async () => {
      setLoading(true);
      const { data, error: qErr } = await supabase.from("transactions").select("*").order("created_at", { ascending: false }).limit(500);
      if (cancelled) return;
      if (qErr) setError(qErr.message);
      else {
        setError(null);
        setRows((data as TxRow[]) ?? []);
      }
      setLoading(false);
    })();
    return () => {
      cancelled = true;
    };
  }, []);

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
      {error && <div className="error">{error}</div>}
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
      <div className="stack mt" style={{ overflowX: "auto" }}>
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
      <Link to="/admin">Admin home</Link>
    </div>
  );
}
