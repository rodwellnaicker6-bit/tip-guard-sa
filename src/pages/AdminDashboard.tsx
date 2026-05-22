import { useCallback, useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { supabase } from "../lib/supabase";
import { zarFromCents } from "../lib/money";
import PageLoader from "../components/PageLoader";
import { useToast } from "../context/useToast";
import { logAdminAction } from "../lib/adminAudit";

type Metrics = {
  tips_succeeded: number;
  tips_pending: number;
  volume_cents_succeeded: number;
  guards_total: number;
  guards_verified: number;
  merchants_total?: number;
  merchants_verified?: number;
  referrals_total?: number;
  referrals_qualified?: number;
  loyalty_wallets?: number;
  loyalty_points_outstanding?: number;
  kyc_open?: number;
  analytics_24h?: number;
};

type Tab = "overview" | "guards" | "payouts" | "payments" | "activity" | "fraud";

type GuardRow = { id: string; display_name: string; verified: boolean; user_id: string | null; location: string | null };
type PayoutRow = { id: string; user_id: string; amount_cents: number; status: string; created_at: string };
type LogRow = { id: number; action: string; entity_type: string | null; created_at: string; meta: unknown };
type AuditRow = { id: string; action: string; entity_type: string | null; entity_id: string | null; created_at: string; metadata: unknown };
type FraudRow = { id: string; kind: string; created_at: string; detail: unknown };
type FailedTxRow = {
  id: string;
  user_id: string;
  type: string;
  amount_cents: number;
  paystack_reference: string | null;
  created_at: string;
};

export default function AdminDashboard() {
  const toast = useToast();
  const [tab, setTab] = useState<Tab>("overview");
  const [metrics, setMetrics] = useState<Metrics | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [ready, setReady] = useState(false);
  const [refreshing, setRefreshing] = useState(false);
  const [pendingGuards, setPendingGuards] = useState<GuardRow[]>([]);
  const [payouts, setPayouts] = useState<PayoutRow[]>([]);
  const [logs, setLogs] = useState<LogRow[]>([]);
  const [auditLogs, setAuditLogs] = useState<AuditRow[]>([]);
  const [fraud, setFraud] = useState<FraudRow[]>([]);
  const [failedTx, setFailedTx] = useState<FailedTxRow[]>([]);
  const [payoutsFrozen, setPayoutsFrozen] = useState(false);
  const [freezeSaving, setFreezeSaving] = useState(false);

  const loadMetrics = useCallback(async () => {
    const { data, error: rpcErr } = await supabase.rpc("admin_dashboard_metrics");
    if (!rpcErr && data && typeof data === "object" && !Array.isArray(data)) {
      setMetrics(data as unknown as Metrics);
      setError(null);
      return;
    }
    setError(rpcErr?.message ?? "Could not load metrics.");
    const [{ count: gt }, { count: gv }] = await Promise.all([
      supabase.from("guards").select("id", { count: "exact", head: true }),
      supabase.from("guards").select("id", { count: "exact", head: true }).eq("verified", true),
    ]);
    setMetrics({
      tips_succeeded: 0,
      tips_pending: 0,
      volume_cents_succeeded: 0,
      guards_total: gt ?? 0,
      guards_verified: gv ?? 0,
    });
  }, []);

  const loadPlatform = useCallback(async () => {
    const { data } = await supabase.from("platform_settings").select("payouts_frozen").eq("id", 1).maybeSingle();
    if (data && typeof data.payouts_frozen === "boolean") setPayoutsFrozen(data.payouts_frozen);
  }, []);

  const loadLists = useCallback(async () => {
    const [gRes, pRes, lRes, aRes, fRes, txRes] = await Promise.all([
      supabase.from("guards").select("id, display_name, verified, user_id, location").eq("verified", false).order("created_at", { ascending: false }).limit(50),
      supabase.from("payout_requests").select("id, user_id, amount_cents, status, created_at").order("created_at", { ascending: false }).limit(50),
      supabase.from("activity_logs").select("id, action, entity_type, created_at, meta").order("created_at", { ascending: false }).limit(40),
      supabase.from("admin_audit_log").select("id, action, entity_type, entity_id, created_at, metadata").order("created_at", { ascending: false }).limit(40),
      supabase.from("fraud_events").select("id, kind, created_at, detail").order("created_at", { ascending: false }).limit(30),
      supabase.from("transactions").select("id, user_id, type, amount_cents, paystack_reference, created_at").eq("status", "failed").order("created_at", { ascending: false }).limit(30),
    ]);
    if (!gRes.error && gRes.data) setPendingGuards(gRes.data as GuardRow[]);
    if (!pRes.error && pRes.data) setPayouts(pRes.data as PayoutRow[]);
    if (!lRes.error && lRes.data) setLogs(lRes.data as LogRow[]);
    if (!aRes.error && aRes.data) setAuditLogs(aRes.data as AuditRow[]);
    if (!fRes.error && fRes.data) setFraud(fRes.data as FraudRow[]);
    if (!txRes.error && txRes.data) setFailedTx(txRes.data as FailedTxRow[]);
  }, []);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      await loadMetrics();
      await loadPlatform();
      await loadLists();
      if (!cancelled) setReady(true);
    })();
    return () => {
      cancelled = true;
    };
  }, [loadMetrics, loadPlatform, loadLists]);

  async function refreshAll() {
    setRefreshing(true);
    try {
      await loadMetrics();
      await loadPlatform();
      await loadLists();
    } finally {
      setRefreshing(false);
    }
  }

  async function togglePayoutsFrozen() {
    setFreezeSaving(true);
    const next = !payoutsFrozen;
    const { error: uErr } = await supabase
      .from("platform_settings")
      .update({ payouts_frozen: next, updated_at: new Date().toISOString() })
      .eq("id", 1);
    setFreezeSaving(false);
    if (uErr) {
      toast.error(uErr.message);
      return;
    }
    setPayoutsFrozen(next);
    void logAdminAction("payouts_freeze_toggle", "platform_settings", "1", { payouts_frozen: next });
    toast.success(next ? "Payouts frozen." : "Payouts enabled.");
  }

  async function approveGuard(id: string) {
    const { error: uErr } = await supabase.from("guards").update({ verified: true }).eq("id", id);
    if (uErr) {
      toast.error(uErr.message);
      return;
    }
    void logAdminAction("guard_approve", "guards", id);
    toast.success("Guard verified.");
    setPendingGuards((prev) => prev.filter((g) => g.id !== id));
    void loadMetrics();
  }

  async function rejectGuard(id: string, name: string) {
    const { error: fErr } = await supabase.from("fraud_events").insert({
      kind: "verification_rejected",
      detail: { guard_id: id, display_name: name },
    });
    if (fErr) {
      toast.error(fErr.message);
      return;
    }
    void logAdminAction("guard_reject", "guards", id, { display_name: name });
    toast.success("Verification rejected (logged).");
    setPendingGuards((prev) => prev.filter((g) => g.id !== id));
  }

  async function flagGuard(id: string, name: string) {
    const { error: fErr } = await supabase.from("fraud_events").insert({
      kind: "admin_flag",
      detail: { guard_id: id, display_name: name },
    });
    if (fErr) {
      toast.error(fErr.message);
      return;
    }
    void logAdminAction("guard_flag", "guards", id, { display_name: name });
    toast.success("Guard flagged for review.");
    void loadLists();
  }

  async function setPayoutStatus(id: string, status: "processing" | "paid" | "rejected" | "failed") {
    const { data, error: rpcErr } = await supabase.rpc("admin_update_payout_status", {
      p_payout_id: id,
      p_status: status,
    });
    if (rpcErr) {
      toast.error(rpcErr.message);
      return;
    }
    const result = data as { ok?: boolean; error?: string } | null;
    if (result?.ok === false) {
      toast.error(result.error ?? "Payout update failed");
      return;
    }
    toast.success(`Payout marked ${status}.`);
    void loadLists();
  }

  if (!ready) return <PageLoader />;

  const tabs: { id: Tab; label: string }[] = [
    { id: "overview", label: "Overview" },
    { id: "guards", label: "Guards" },
    { id: "payouts", label: "Payouts" },
    { id: "payments", label: "Failed" },
    { id: "activity", label: "Activity" },
    { id: "fraud", label: "Fraud" },
  ];

  return (
    <div className="shell mx-auto max-w-2xl space-y-5 px-5 py-8 pb-20">
      <header className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
        <div>
          <p className="text-xs font-bold uppercase tracking-wider text-slate-500">Operations</p>
          <h1 className="text-2xl font-black text-white">Admin</h1>
          {error && metrics && <p className="mt-1 text-sm text-amber-400">{error} Partial data shown.</p>}
        </div>
        <button
          type="button"
          className="min-h-[44px] shrink-0 rounded-xl border border-white/15 px-4 text-sm font-bold text-amber-300 hover:bg-white/5 disabled:opacity-50"
          disabled={refreshing}
          onClick={() => void refreshAll()}
        >
          {refreshing ? "Refreshing…" : "Refresh data"}
        </button>
      </header>

      <div className="flex flex-wrap gap-2">
        {tabs.map((t) => (
          <button
            key={t.id}
            type="button"
            onClick={() => setTab(t.id)}
            className={`min-h-[44px] rounded-full px-4 py-2 text-sm font-bold ${
              tab === t.id ? "bg-amber-500 text-black" : "border border-white/10 bg-white/5 text-slate-300"
            }`}
          >
            {t.label}
          </button>
        ))}
      </div>

      {tab === "overview" && (
        <div className="flex flex-col gap-3 rounded-2xl border border-white/10 bg-white/5 p-4 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <p className="text-xs font-bold uppercase text-slate-500">Payout freeze</p>
            <p className="mt-1 text-sm text-slate-400">
              {payoutsFrozen
                ? "New guard payout requests are blocked (503)."
                : "Payouts are accepting new requests."}
            </p>
          </div>
          <button
            type="button"
            disabled={freezeSaving}
            onClick={() => void togglePayoutsFrozen()}
            className={`min-h-[44px] shrink-0 rounded-xl px-5 text-sm font-bold ${
              payoutsFrozen ? "bg-emerald-500/20 text-emerald-300" : "bg-red-500/20 text-red-300"
            }`}
          >
            {freezeSaving ? "Saving…" : payoutsFrozen ? "Unfreeze payouts" : "Freeze payouts"}
          </button>
        </div>
      )}

      {tab === "overview" && metrics && (
        <div className="grid min-w-0 grid-cols-2 gap-3 sm:grid-cols-3">
          <MetricCard label="Tips OK" value={String(metrics.tips_succeeded)} />
          <MetricCard label="Tips pending" value={String(metrics.tips_pending)} />
          <MetricCard label="Volume" value={zarFromCents(Number(metrics.volume_cents_succeeded))} />
          <MetricCard label="Guards" value={`${metrics.guards_verified}/${metrics.guards_total}`} sub="verified / total" />
          <MetricCard label="Merchants" value={`${metrics.merchants_verified ?? 0}/${metrics.merchants_total ?? 0}`} sub="verified / total" />
          <MetricCard label="Referrals" value={`${metrics.referrals_qualified ?? 0}/${metrics.referrals_total ?? 0}`} sub="qualified / total" />
          <MetricCard label="Loyalty wallets" value={String(metrics.loyalty_wallets ?? 0)} />
          <MetricCard label="Points outstanding" value={String(metrics.loyalty_points_outstanding ?? 0)} sub="liability (internal)" />
          <MetricCard label="KYC queue" value={String(metrics.kyc_open ?? 0)} sub="submitted + in review" />
          <MetricCard label="Analytics 24h" value={String(metrics.analytics_24h ?? 0)} sub="server events" />
        </div>
      )}

      {tab === "guards" && (
        <section className="space-y-2 overflow-x-auto">
          <h2 className="text-sm font-bold uppercase text-slate-500">Pending verification</h2>
          {pendingGuards.length === 0 ? (
            <p className="text-sm text-slate-500">No unverified guards.</p>
          ) : (
            pendingGuards.map((g) => (
              <div key={g.id} className="flex min-w-[280px] flex-col gap-2 rounded-xl border border-white/10 bg-white/5 p-3 sm:min-w-0 sm:flex-row sm:items-center sm:justify-between">
                <div>
                  <p className="font-bold text-white">{g.display_name}</p>
                  <p className="text-xs text-slate-500">{g.location ?? "—"}</p>
                </div>
                <div className="flex flex-wrap gap-2">
                  <button
                    type="button"
                    className="rounded-xl bg-emerald-500/20 px-4 py-2 text-sm font-bold text-emerald-300"
                    onClick={() => void approveGuard(g.id)}
                  >
                    Approve
                  </button>
                  <button
                    type="button"
                    className="rounded-xl bg-red-500/20 px-4 py-2 text-sm font-bold text-red-300"
                    onClick={() => void rejectGuard(g.id, g.display_name)}
                  >
                    Reject
                  </button>
                  <button
                    type="button"
                    className="rounded-xl border border-amber-500/30 px-4 py-2 text-sm font-bold text-amber-300"
                    onClick={() => void flagGuard(g.id, g.display_name)}
                  >
                    Flag
                  </button>
                </div>
              </div>
            ))
          )}
        </section>
      )}

      {tab === "payments" && (
        <section className="space-y-2 overflow-x-auto">
          <h2 className="text-sm font-bold uppercase text-slate-500">Recent failed payments</h2>
          {failedTx.length === 0 ? (
            <p className="text-sm text-slate-500">No failed transaction rows.</p>
          ) : (
            failedTx.map((t) => (
              <div key={t.id} className="rounded-xl border border-red-500/20 bg-red-500/5 p-3 text-sm">
                <p className="font-bold text-red-200/90">
                  {zarFromCents(Number(t.amount_cents))} · {t.type}
                </p>
                <p className="text-xs text-slate-500">
                  {new Date(t.created_at).toLocaleString()} · user {t.user_id.slice(0, 8)}…
                </p>
                {t.paystack_reference && (
                  <p className="mt-1 truncate font-mono text-[11px] text-amber-200/70">{t.paystack_reference}</p>
                )}
              </div>
            ))
          )}
          <Link className="block text-center text-sm font-semibold text-amber-400" to="/admin/transactions">
            Full transaction ledger →
          </Link>
        </section>
      )}

      {tab === "payouts" && (
        <section className="space-y-2 overflow-x-auto">
          <h2 className="text-sm font-bold uppercase text-slate-500">Payout queue</h2>
          {payouts.length === 0 ? (
            <p className="text-sm text-slate-500">No payout requests.</p>
          ) : (
            payouts.map((p) => (
              <div key={p.id} className="flex min-w-[280px] flex-col gap-2 rounded-xl border border-white/10 bg-white/5 p-3 sm:min-w-0 sm:flex-row sm:flex-wrap sm:items-center sm:justify-between">
                <div>
                  <p className="font-bold text-amber-300">{zarFromCents(Number(p.amount_cents))}</p>
                  <p className="text-xs text-slate-500">
                    {p.status} · {new Date(p.created_at).toLocaleString()}
                  </p>
                </div>
                <div className="flex flex-wrap gap-2">
                  <button type="button" className="rounded-lg bg-white/10 px-3 py-1 text-xs font-bold" onClick={() => void setPayoutStatus(p.id, "processing")}>
                    Processing
                  </button>
                  <button type="button" className="rounded-lg bg-emerald-500/20 px-3 py-1 text-xs font-bold text-emerald-300" onClick={() => void setPayoutStatus(p.id, "paid")}>
                    Paid
                  </button>
                  <button type="button" className="rounded-lg bg-red-500/20 px-3 py-1 text-xs font-bold text-red-300" onClick={() => void setPayoutStatus(p.id, "rejected")}>
                    Reject
                  </button>
                  <button type="button" className="rounded-lg bg-red-500/10 px-3 py-1 text-xs font-bold text-red-400" onClick={() => void setPayoutStatus(p.id, "failed")}>
                    Failed
                  </button>
                </div>
              </div>
            ))
          )}
        </section>
      )}

      {tab === "activity" && (
        <section className="space-y-4 overflow-x-auto">
          <div className="space-y-2">
            <h2 className="text-sm font-bold uppercase text-slate-500">Admin audit trail</h2>
            {auditLogs.length === 0 ? (
              <p className="text-sm text-slate-500">No admin actions logged yet.</p>
            ) : (
              auditLogs.map((l) => (
                <div key={l.id} className="rounded-lg border border-amber-500/10 bg-amber-500/5 px-3 py-2 text-xs text-slate-400">
                  <span className="font-mono text-amber-200/80">{l.action}</span> · {l.entity_type ?? "—"}{" "}
                  {l.entity_id ? `· ${l.entity_id.slice(0, 8)}…` : ""} · {new Date(l.created_at).toLocaleString()}
                </div>
              ))
            )}
          </div>
          <div className="space-y-2">
            <h2 className="text-sm font-bold uppercase text-slate-500">Activity log</h2>
            {logs.length === 0 ? (
              <p className="text-sm text-slate-500">No rows (service_role writes from Edge recommended).</p>
            ) : (
              logs.map((l) => (
                <div key={l.id} className="rounded-lg border border-white/5 bg-black/30 px-3 py-2 text-xs text-slate-400">
                  <span className="font-mono text-amber-200/80">{l.action}</span> · {l.entity_type ?? "—"} ·{" "}
                  {new Date(l.created_at).toLocaleString()}
                </div>
              ))
            )}
          </div>
        </section>
      )}

      {tab === "fraud" && (
        <section className="space-y-2 overflow-x-auto">
          <h2 className="text-sm font-bold uppercase text-slate-500">Fraud flags</h2>
          {fraud.length === 0 ? (
            <p className="text-sm text-slate-500">No fraud_events rows yet.</p>
          ) : (
            fraud.map((f) => (
              <div key={f.id} className="rounded-lg border border-red-500/20 bg-red-500/5 px-3 py-2 text-xs text-red-200/90">
                <strong>{f.kind}</strong> · {new Date(f.created_at).toLocaleString()}
              </div>
            ))
          )}
        </section>
      )}

      <div className="flex flex-col gap-2 sm:flex-row">
        <Link className="rounded-xl border border-white/10 py-3 text-center text-sm font-semibold text-amber-400" to="/admin/metrics">
          Production metrics
        </Link>
        <Link className="rounded-xl border border-white/10 py-3 text-center text-sm font-semibold text-amber-400" to="/admin/fraud">
          Fraud & DLQ
        </Link>
        <Link className="rounded-xl border border-white/10 py-3 text-center text-sm font-semibold text-amber-400" to="/admin/security">
          Security
        </Link>
        <Link className="rounded-xl border border-white/10 py-3 text-center text-sm font-semibold text-amber-400" to="/admin/transactions">
          Transactions
        </Link>
        <Link className="rounded-xl border border-white/10 py-3 text-center text-sm font-semibold text-amber-400" to="/admin/analytics">
          Payment analytics
        </Link>
        <Link className="rounded-xl border border-white/10 py-3 text-center text-sm font-semibold text-slate-300" to="/">
          Home
        </Link>
      </div>
    </div>
  );
}

function MetricCard({ label, value, sub }: { label: string; value: string; sub?: string }) {
  return (
    <div className="rounded-2xl border border-white/10 bg-gradient-to-br from-slate-900 to-slate-950 p-4">
      <p className="text-xs font-bold uppercase text-slate-500">{label}</p>
      <p className="mt-1 text-xl font-black text-amber-400">{value}</p>
      {sub && <p className="text-xs text-slate-500">{sub}</p>}
    </div>
  );
}
