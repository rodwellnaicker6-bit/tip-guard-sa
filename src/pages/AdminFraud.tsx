import { useCallback, useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { supabase } from "../lib/supabase";
import PageLoader from "../components/PageLoader";
import { useToast } from "../context/useToast";
import { logAdminAction } from "../lib/adminAudit";

type DlqRow = {
  id: string;
  event_id: string | null;
  event_type: string | null;
  attempts: number;
  error_message: string | null;
  updated_at: string;
};

type FraudRow = { id: string; kind: string; created_at: string; detail: unknown };
type DisputeRow = { id: string; merchant_id: string; status: string; reason: string | null; created_at: string };
type PaymentEventRow = {
  id: string;
  provider: string;
  event_type: string;
  status: string;
  created_at: string;
  paystack_reference: string | null;
};

export default function AdminFraud() {
  const toast = useToast();
  const [dlq, setDlq] = useState<DlqRow[]>([]);
  const [pending, setPending] = useState<DlqRow[]>([]);
  const [fraud, setFraud] = useState<FraudRow[]>([]);
  const [disputes, setDisputes] = useState<DisputeRow[]>([]);
  const [paymentEvents, setPaymentEvents] = useState<PaymentEventRow[]>([]);
  const [qrScans, setQrScans] = useState<PaymentEventRow[]>([]);
  const [ready, setReady] = useState(false);

  const load = useCallback(async () => {
    const [dlqRes, pendRes, fRes, dRes, peRes, scanRes] = await Promise.all([
      supabase
        .from("webhook_retry_queue")
        .select("id, event_id, event_type, attempts, error_message, updated_at")
        .eq("status", "dead_letter")
        .order("updated_at", { ascending: false })
        .limit(50),
      supabase
        .from("webhook_retry_queue")
        .select("id, event_id, event_type, attempts, error_message, updated_at")
        .eq("status", "pending")
        .order("next_retry_at", { ascending: true })
        .limit(25),
      supabase.from("fraud_events").select("id, kind, created_at, detail").order("created_at", { ascending: false }).limit(40),
      supabase
        .from("disputes")
        .select("id, merchant_id, status, reason, created_at")
        .eq("status", "open")
        .order("created_at", { ascending: false })
        .limit(30),
      supabase
        .from("payment_events")
        .select("id, provider, event_type, status, created_at, paystack_reference")
        .order("created_at", { ascending: false })
        .limit(25),
      supabase
        .from("payment_events")
        .select("id, provider, event_type, status, created_at, paystack_reference")
        .eq("event_type", "qr.scan")
        .order("created_at", { ascending: false })
        .limit(20),
    ]);
    if (!dlqRes.error && dlqRes.data) setDlq(dlqRes.data as DlqRow[]);
    if (!pendRes.error && pendRes.data) setPending(pendRes.data as DlqRow[]);
    if (!fRes.error && fRes.data) setFraud(fRes.data as FraudRow[]);
    if (!dRes.error && dRes.data) setDisputes(dRes.data as DisputeRow[]);
    if (!peRes.error && peRes.data) setPaymentEvents(peRes.data as PaymentEventRow[]);
    if (!scanRes.error && scanRes.data) setQrScans(scanRes.data as PaymentEventRow[]);
  }, []);

  async function resolveDispute(id: string) {
    const { error } = await supabase
      .from("disputes")
      .update({
        status: "resolved",
        resolution_note: "Resolved by admin",
        resolved_at: new Date().toISOString(),
      })
      .eq("id", id);
    if (error) {
      toast.error(error.message);
      return;
    }
    void logAdminAction("dispute_resolve", "disputes", id);
    toast.success("Dispute resolved.");
    void load();
  }

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

  async function promoteDlq(id: string) {
    const { error } = await supabase
      .from("webhook_retry_queue")
      .update({ status: "pending", attempts: 0, next_retry_at: new Date().toISOString() })
      .eq("id", id);
    if (!error) void load();
  }

  if (!ready) return <PageLoader />;

  return (
    <div className="shell mx-auto max-w-2xl space-y-6 px-5 py-8 pb-20">
      <header>
        <p className="text-xs font-bold uppercase tracking-wider text-slate-500">Security</p>
        <h1 className="text-2xl font-black text-white">Fraud & webhook DLQ</h1>
        <p className="mt-1 text-sm text-slate-500">
          Dead-letter rows exceeded max attempts. Promote to pending for <code className="text-amber-300">process-webhook-retries</code>.
        </p>
      </header>

      <section className="space-y-2">
        <h2 className="text-sm font-bold uppercase text-slate-500">Dead letter ({dlq.length})</h2>
        {dlq.length === 0 ? (
          <p className="text-sm text-slate-500">No dead-letter webhooks.</p>
        ) : (
          dlq.map((r) => (
            <div key={r.id} className="rounded-xl border border-red-500/20 bg-red-500/5 p-3 text-sm">
              <p className="font-mono text-xs text-amber-200/80">{r.event_type ?? "—"} · {r.event_id ?? "—"}</p>
              <p className="text-xs text-slate-500">
                attempts {r.attempts} · {new Date(r.updated_at).toLocaleString()}
              </p>
              {r.error_message && <p className="mt-1 text-xs text-red-200/70">{r.error_message}</p>}
              <button
                type="button"
                className="mt-2 rounded-lg bg-amber-500/20 px-3 py-1 text-xs font-bold text-amber-300"
                onClick={() => void promoteDlq(r.id)}
              >
                Re-queue
              </button>
            </div>
          ))
        )}
      </section>

      <section className="space-y-2">
        <h2 className="text-sm font-bold uppercase text-slate-500">Pending retries ({pending.length})</h2>
        {pending.map((r) => (
          <div key={r.id} className="rounded-lg border border-white/5 px-3 py-2 text-xs text-slate-400">
            {r.event_type} · attempt {r.attempts}
          </div>
        ))}
      </section>

      <section className="space-y-2">
        <h2 className="text-sm font-bold uppercase text-slate-500">Open disputes ({disputes.length})</h2>
        {disputes.length === 0 ? (
          <p className="text-sm text-slate-500">No open disputes.</p>
        ) : (
          disputes.map((d) => (
            <div key={d.id} className="rounded-xl border border-white/10 p-3 text-sm">
              <p className="text-slate-300">{d.reason}</p>
              <p className="text-xs text-slate-500">{new Date(d.created_at).toLocaleString()}</p>
              <button
                type="button"
                className="mt-2 rounded-lg bg-emerald-500/20 px-3 py-1 text-xs font-bold text-emerald-300"
                onClick={() => void resolveDispute(d.id)}
              >
                Resolve
              </button>
            </div>
          ))
        )}
      </section>

      <section className="space-y-2">
        <h2 className="text-sm font-bold uppercase text-slate-500">QR scans (payment_events)</h2>
        {qrScans.length === 0 ? (
          <p className="text-sm text-slate-500">No qr.scan events in audit log.</p>
        ) : (
          qrScans.map((e) => (
            <div key={e.id} className="rounded-lg border border-amber-500/10 px-3 py-2 text-xs text-slate-400">
              {e.status} · {new Date(e.created_at).toLocaleString()}
            </div>
          ))
        )}
      </section>

      <section className="space-y-2">
        <h2 className="text-sm font-bold uppercase text-slate-500">Recent payment_events</h2>
        {paymentEvents.length === 0 ? (
          <p className="text-sm text-slate-500">No payment events (admin RLS or migration).</p>
        ) : (
          paymentEvents.map((e) => (
            <div key={e.id} className="rounded-lg border border-white/5 px-3 py-2 text-xs">
              <strong className="text-slate-300">{e.provider}</strong> · {e.event_type} · {e.status}
              <br />
              <span className="text-slate-500">{new Date(e.created_at).toLocaleString()}</span>
              {e.paystack_reference ? (
                <>
                  <br />
                  <span className="font-mono text-amber-200/70">{e.paystack_reference}</span>
                </>
              ) : null}
            </div>
          ))
        )}
      </section>

      <section className="space-y-2">
        <h2 className="text-sm font-bold uppercase text-slate-500">Recent fraud_events</h2>
        {fraud.map((f) => (
          <div key={f.id} className="rounded-lg border border-white/5 px-3 py-2 text-xs">
            <strong className="text-red-200/90">{f.kind}</strong> · {new Date(f.created_at).toLocaleString()}
          </div>
        ))}
      </section>

      <Link className="block text-center text-sm font-semibold text-amber-400" to="/admin/metrics">
        ← Production metrics
      </Link>
    </div>
  );
}
