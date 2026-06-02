import { useEffect, useRef, useState, type FormEvent } from "react";
import { Link } from "react-router-dom";
import { parseFunctionsInvokeError } from "../lib/edgeFunctionInvoke";
import { PAYOUT_REQUEST_TIMEOUT_MS, DASHBOARD_LOAD_TIMEOUT_MS, logFlow, withOperationTimeout } from "../lib/operationTimeout";
import { perfLog } from "../lib/perfLog";
import { SlowLoadHint } from "../components/SlowLoadHint";
import { useUiWatchdog } from "../lib/uiWatchdog";
import { ensurePaymentAccessToken } from "../lib/paymentSession";
import { supabase } from "../lib/supabase";
import { zarFromCents } from "../lib/money";
import { useAuth } from "../context/useAuth";
import type { GuardRow } from "./CustomerHome";
import { GlassPanel } from "../components/fintech/GlassPanel";
import { TrustRibbon } from "../components/fintech/TrustRibbon";
import { Sparkline } from "../components/fintech/Sparkline";
import EmptyState from "../components/EmptyState";
import { FetchError } from "../components/FetchError";
import { ProfileCompletionCard } from "../components/ProfileCompletionCard";
import { StatCardsSkeleton } from "../components/StatCardsSkeleton";
import { VerificationStatusBadge } from "../components/VerificationStatusBadge";
import { PayoutSchedulePanel } from "../components/PayoutSchedulePanel";
import { isPayoutSchedule, type PayoutSchedule } from "../lib/payoutSchedule";

type TipRow = {
  id: string;
  amount_cents: number;
  status: string;
  created_at: string;
};

type PayoutRow = {
  id: string;
  amount_cents: number;
  status: string;
  created_at: string;
};

import { EmergencyErrorBoundary } from "../lib/emergencySafeMode";

function GuardHomeContent() {
  const { user, profileFields, signOut, sessionReady } = useAuth();
  const [guard, setGuard] = useState<GuardRow | null>(null);
  const [recentTips, setRecentTips] = useState<TipRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [reload, setReload] = useState(0);
  const [payoutAmount, setPayoutAmount] = useState("500");
  const [payoutBusy, setPayoutBusy] = useState(false);
  const payoutLastSubmitRef = useRef(0);
  const PAYOUT_DEBOUNCE_MS = 2_500;
  const [toast, setToast] = useState<string | null>(null);
  const [sparkValues, setSparkValues] = useState<number[]>([]);
  const [walletAvail, setWalletAvail] = useState<number | null>(null);
  const [walletPending, setWalletPending] = useState(0);
  const [payoutSchedule, setPayoutSchedule] = useState<PayoutSchedule>("weekly");
  const [nextPayoutAt, setNextPayoutAt] = useState<string | null>(null);
  const [minPayoutCents, setMinPayoutCents] = useState(10000);
  const [payoutSchemaComplete, setPayoutSchemaComplete] = useState(true);
  const [recentPayouts, setRecentPayouts] = useState<PayoutRow[]>([]);
  const slowLoad = useUiWatchdog(loading);

  useEffect(() => {
    if (!sessionReady || !user?.id) return;
    let cancelled = false;
    const watchdog = window.setTimeout(() => {
      if (cancelled) return;
      setLoading(false);
      setError((prev) => prev ?? "Dashboard load timed out. Please try again.");
    }, DASHBOARD_LOAD_TIMEOUT_MS + 1_000);

    (async () => {
      setLoading(true);
      setError(null);
      const t0 = performance.now();
      try {
        await withOperationTimeout(
          "dashboard",
          "guard home load",
          async (signal) => {
            const { data, error: err } = await supabase
              .from("guards")
              .select(
                "id, display_name, location, province, avatar_initials, verified, rating, tips_count, balance_cents, payout_schedule, next_payout_at, minimum_payout_threshold_cents",
              )
              .eq("user_id", user.id)
              .abortSignal(signal)
              .maybeSingle();
            if (cancelled) return;
            if (err) {
              setError("We could not load your guard profile. Please try again.");
              setGuard(null);
              return;
            }
            const g = (data as GuardRow & {
              payout_schedule?: string;
              next_payout_at?: string | null;
              minimum_payout_threshold_cents?: number;
            }) ?? null;
            setGuard(g);
            if (g) {
              const hasPayoutCols = g.payout_schedule != null || g.next_payout_at != null;
              setPayoutSchemaComplete(hasPayoutCols);
              const sched = g.payout_schedule ?? "";
              setPayoutSchedule(isPayoutSchedule(sched) ? sched : "weekly");
              setNextPayoutAt(g.next_payout_at ?? null);
              setMinPayoutCents(g.minimum_payout_threshold_cents ?? 10000);
            }
            if (g?.id) {
              const keys: string[] = [];
              for (let i = 13; i >= 0; i--) {
                const d = new Date();
                d.setDate(d.getDate() - i);
                d.setHours(0, 0, 0, 0);
                keys.push(d.toISOString().slice(0, 10));
              }
              const since = `${keys[0]}T00:00:00.000Z`;
              const [walletRes, tipsRes, payoutsRes, sparkRes] = await Promise.all([
                supabase
                  .from("wallet_accounts")
                  .select("available_cents, pending_cents")
                  .eq("guard_id", g.id)
                  .abortSignal(signal)
                  .maybeSingle(),
                supabase
                  .from("tips")
                  .select("id, amount_cents, status, created_at")
                  .eq("guard_id", g.id)
                  .order("created_at", { ascending: false })
                  .limit(12)
                  .abortSignal(signal),
                supabase
                  .from("payouts")
                  .select("id, amount_cents, status, created_at")
                  .eq("user_id", user.id)
                  .order("created_at", { ascending: false })
                  .limit(5)
                  .abortSignal(signal),
                supabase
                  .from("tips")
                  .select("amount_cents, created_at")
                  .eq("guard_id", g.id)
                  .eq("status", "succeeded")
                  .gte("created_at", since)
                  .abortSignal(signal),
              ]);
              if (!cancelled) {
                const w = walletRes.data;
                setWalletAvail((w?.available_cents as number | undefined) ?? g.balance_cents ?? 0);
                setWalletPending((w?.pending_cents as number | undefined) ?? 0);
                if (!tipsRes.error && tipsRes.data) setRecentTips(tipsRes.data as TipRow[]);
                else setRecentTips([]);
                setRecentPayouts((payoutsRes.data as PayoutRow[]) ?? []);
                if (!sparkRes.error && sparkRes.data) {
                  const totals: Record<string, number> = Object.fromEntries(keys.map((k) => [k, 0]));
                  for (const row of sparkRes.data) {
                    const day = (row.created_at as string).slice(0, 10);
                    if (totals[day] != null) totals[day] += row.amount_cents as number;
                  }
                  setSparkValues(keys.map((k) => totals[k] ?? 0));
                }
              }
            } else if (!cancelled) {
              setRecentTips([]);
              setRecentPayouts([]);
              setSparkValues([]);
            }
          },
          DASHBOARD_LOAD_TIMEOUT_MS,
          undefined,
          { queued: false },
        );
        perfLog("guard home load", Math.round(performance.now() - t0), { ok: true });
      } catch {
        if (!cancelled) {
          setError("Dashboard load timed out. Please try again.");
          setGuard(null);
        }
      } finally {
        window.clearTimeout(watchdog);
        if (!cancelled) setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
      window.clearTimeout(watchdog);
    };
  }, [user?.id, sessionReady, reload]);

  async function onRequestPayout(e: FormEvent) {
    e.preventDefault();
    if (payoutBusy) return;
    const now = Date.now();
    if (now - payoutLastSubmitRef.current < PAYOUT_DEBOUNCE_MS) return;
    payoutLastSubmitRef.current = now;
    setToast(null);
    const raw = payoutAmount.replace(/\D/g, "");
    const rands = Number(raw || "0");
    const cents = Math.round(rands * 100);
    if (cents < 100) {
      setToast("Enter at least R1.");
      return;
    }
    setPayoutBusy(true);
    try {
      const session = await ensurePaymentAccessToken();
      if (!session.ok) {
        setToast(session.message);
        return;
      }
      const { data, error: fnErr } = await withOperationTimeout(
        "payout",
        "request-payout",
        supabase.functions.invoke("request-payout", {
          body: { amount_cents: cents },
          headers: { Authorization: `Bearer ${session.accessToken}` },
        }),
        PAYOUT_REQUEST_TIMEOUT_MS,
      );
      if (fnErr) {
        const detail = await parseFunctionsInvokeError(fnErr);
        logFlow("payout", "request-payout failed", { message: detail.message, code: detail.code });
        setToast(detail.message);
        return;
      }
      const body = data as { error?: string; message?: string } | null;
      if (body?.error) {
        setToast(body.error);
        return;
      }
      setToast(body?.message ?? "Payout request submitted.");
    } catch (err) {
      const msg = err instanceof Error ? err.message : "Payout request failed.";
      logFlow("payout", "request-payout error", { message: msg });
      setToast(msg);
    } finally {
      setPayoutBusy(false);
    }
  }

  if (loading) {
    return (
      <div className="shell dashboard-hub mx-auto max-w-lg space-y-5 px-4 py-8 pb-16 sm:px-5">
        <header className="page-header">
          <p className="muted-label">Guard dashboard</p>
          <p className="text-slate-400">Loading…</p>
        </header>
        <StatCardsSkeleton />
        <SlowLoadHint show={slowLoad} />
      </div>
    );
  }

  if (error) {
    return (
      <div className="shell dashboard-hub mx-auto max-w-lg space-y-4 px-4 py-8 sm:px-5">
        <FetchError message={error} onRetry={() => setReload((n) => n + 1)} />
        <Link to="/" className="tap-target text-center text-sm text-amber-400">
          Home
        </Link>
      </div>
    );
  }

  if (!guard) {
    return (
      <div className="shell dashboard-hub mx-auto flex max-w-lg flex-col gap-4 px-4 py-10 sm:px-5">
        <h2 className="text-xl font-bold text-white">Finish guard profile</h2>
        <p className="text-sm text-slate-400">We could not find a guard profile linked to your account yet.</p>
        <Link
          className="hub-primary-cta tap-target bg-gradient-to-r from-amber-400 to-amber-600 text-black"
          to="/guard/setup"
        >
          Create guard profile
        </Link>
        <button className="tap-target rounded-2xl border border-white/15 py-3 font-semibold text-slate-200" type="button" onClick={() => void signOut()}>
          Sign out
        </button>
      </div>
    );
  }

  const first = (guard.display_name ?? "Guard").split(/\s+/).filter(Boolean)[0] ?? "there";

  return (
    <div className="shell dashboard-hub mx-auto max-w-lg space-y-5 px-4 py-8 pb-16 sm:px-5">
      <header className="fx-fade-up flex flex-wrap items-end justify-between gap-2">
        <div>
          <p className="text-xs font-bold uppercase tracking-wider text-slate-500">Guard dashboard</p>
          <h1 className="fx-gradient-text text-2xl font-black tracking-tight">Hi {first}</h1>
          <p className="text-sm text-slate-400">{guard.location}</p>
        </div>
      </header>

      <GlassPanel className="fx-fade-up border-2 border-amber-500/40 shadow-lg shadow-amber-500/10" glow="amber">
        <PayoutSchedulePanel
          table="guards"
          entityId={guard.id}
          schedule={payoutSchedule}
          nextPayoutAt={nextPayoutAt}
          minimumPayoutThresholdCents={minPayoutCents}
          availableCents={walletAvail ?? guard.balance_cents}
          pendingCents={walletPending}
          prominent
          schemaUnavailable={!payoutSchemaComplete}
          onSaved={() => setReload((n) => n + 1)}
        />
      </GlassPanel>

      <TrustRibbon />

      <ProfileCompletionCard fields={profileFields} />

      <VerificationStatusBadge verified={guard.verified} entityLabel="Guard verification" />

      <GlassPanel className="fx-fade-up" glow="amber">
        <p className="text-[10px] font-bold uppercase tracking-wider text-slate-500">14-day tip volume (ZAR)</p>
        <Sparkline values={sparkValues} height={44} />
        <p className="mt-1 text-xs text-slate-500">Daily totals from successful tips — heatmap-style chart ships next.</p>
      </GlassPanel>

      <section className="grid grid-cols-2 gap-3">
        <GlassPanel glow="amber" className="fx-fade-up">
          <p className="text-xs font-semibold uppercase text-slate-500">Wallet</p>
          <p className="mt-1 text-2xl font-black text-amber-400">
            {zarFromCents(walletAvail ?? guard.balance_cents)}
          </p>
          <p className="mt-1 text-[10px] text-slate-500">
            Pending {zarFromCents(walletPending)} · payouts reviewed
          </p>
        </GlassPanel>
        <GlassPanel glow="slate" className="fx-fade-up">
          <p className="text-xs font-semibold uppercase text-slate-500">Tips</p>
          <p className="mt-1 text-2xl font-black text-white">{guard.tips_count ?? 0}</p>
          <p className="text-xs text-slate-500">{(guard.rating ?? 0).toFixed(1)}★ avg</p>
        </GlassPanel>
      </section>

      <GlassPanel className="fx-fade-up" glow="slate">
        <div className="mb-2 flex items-center justify-between">
          <h2 className="text-sm font-bold uppercase tracking-wide text-slate-400">Live feed</h2>
          <Link to="/guard/history" className="text-xs font-semibold text-amber-400">
            History
          </Link>
        </div>
        <div className="max-h-56 space-y-2 overflow-y-auto pr-1">
          {recentTips.length === 0 ? (
            <EmptyState
              title="No tips yet"
              description="Share your QR code so customers can tip you on site."
              action={
                <Link className="hub-primary-cta tap-target text-amber-200" to="/guard/qr" style={{ background: "rgba(251,191,36,0.15)", border: "1px solid rgba(251,191,36,0.35)" }}>
                  Open QR screen
                </Link>
              }
            />
          ) : (
            recentTips.map((t) => (
              <div
                key={t.id}
                className="flex items-center justify-between rounded-xl border border-white/5 bg-white/5 px-3 py-2 text-sm"
              >
                <span className="font-semibold text-amber-300">{zarFromCents(t.amount_cents)}</span>
                <span className={`text-xs font-bold uppercase ${t.status === "succeeded" ? "text-emerald-400" : "text-slate-400"}`}>
                  {t.status}
                </span>
              </div>
            ))
          )}
        </div>
      </GlassPanel>

      <nav className="hub-nav-grid" aria-label="Guard hub">
        <Link to="/guard/qr" className="hub-nav-link border-amber-500/30 bg-amber-500/10 text-amber-200">
          QR &amp; links
        </Link>
        <Link to="/guard/profile" className="hub-nav-link text-slate-200">
          Profile
        </Link>
        <Link to="/guard/connect" className="hub-nav-link text-slate-200">
          Connect
        </Link>
        <Link to="/guard/history" className="hub-nav-link text-slate-200">
          Transactions
        </Link>
        <a href="#payout-preferences" className="hub-nav-link border-emerald-500/30 bg-emerald-500/10 font-bold text-emerald-200">
          Payouts
        </a>
      </nav>

      {recentPayouts.length > 0 ? (
        <GlassPanel className="fx-fade-up" glow="slate">
          <h3 className="text-sm font-bold uppercase tracking-wide text-slate-400">Payout status</h3>
          <ul className="mt-2 space-y-2">
            {recentPayouts.map((p) => (
              <li
                key={p.id}
                className="flex items-center justify-between rounded-xl border border-white/5 bg-white/5 px-3 py-2 text-sm"
              >
                <span className="font-semibold text-white">{zarFromCents(p.amount_cents)}</span>
                <span className="text-xs font-bold uppercase text-slate-400">{p.status}</span>
              </li>
            ))}
          </ul>
        </GlassPanel>
      ) : null}

      <GlassPanel className="fx-fade-up" glow="emerald">
        <h3 className="text-base font-bold text-white">Request payout</h3>
        <p className="mt-1 text-xs text-slate-500">Creates a payout request for operator review (see admin dashboard).</p>
        <form className="mt-3 space-y-2" onSubmit={onRequestPayout}>
          <label className="block text-xs text-slate-500">
            Amount (ZAR)
            <input
              className="field mt-1 w-full rounded-xl border border-white/10 bg-black/30 px-3 py-2 text-white"
              value={payoutAmount}
              onChange={(e) => setPayoutAmount(e.target.value)}
              inputMode="numeric"
            />
          </label>
          <button className="btn-gold w-full rounded-2xl py-3 font-black" type="submit" disabled={payoutBusy}>
            {payoutBusy ? "Submitting…" : "Submit request"}
          </button>
        </form>
        {toast && <div className="mt-2 rounded-xl border border-emerald-500/30 bg-emerald-500/10 px-3 py-2 text-sm text-emerald-300">{toast}</div>}
      </GlassPanel>

      <div className="flex flex-wrap gap-2">
        <button className="tap-target min-h-[44px] flex-1 rounded-2xl border border-white/10 py-3 text-sm font-semibold text-slate-300" type="button" onClick={() => void signOut()}>
          Sign out
        </button>
        <Link className="tap-target min-h-[44px] flex flex-1 items-center justify-center rounded-2xl border border-white/10 py-3 text-sm font-semibold text-amber-400" to="/">
          Home
        </Link>
      </div>
    </div>
  );
}

export default function GuardHome() {
  return (
    <EmergencyErrorBoundary>
      <GuardHomeContent />
    </EmergencyErrorBoundary>
  );
}
