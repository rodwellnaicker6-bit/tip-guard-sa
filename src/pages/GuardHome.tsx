import { useEffect, useState, type FormEvent } from "react";
import { Link } from "react-router-dom";
import { supabase } from "../lib/supabase";
import { zarFromCents } from "../lib/money";
import { useAuth } from "../context/useAuth";
import type { GuardRow } from "./CustomerHome";
import { GlassPanel } from "../components/fintech/GlassPanel";
import { TrustRibbon } from "../components/fintech/TrustRibbon";
import { Sparkline } from "../components/fintech/Sparkline";

type TipRow = {
  id: string;
  amount_cents: number;
  status: string;
  created_at: string;
};

export default function GuardHome() {
  const { user, signOut } = useAuth();
  const [guard, setGuard] = useState<GuardRow | null>(null);
  const [recentTips, setRecentTips] = useState<TipRow[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [payoutAmount, setPayoutAmount] = useState("500");
  const [payoutBusy, setPayoutBusy] = useState(false);
  const [toast, setToast] = useState<string | null>(null);
  const [sparkValues, setSparkValues] = useState<number[]>([]);

  useEffect(() => {
    if (!user?.id) return;
    let cancelled = false;
    (async () => {
      const { data, error: err } = await supabase.from("guards").select("*").eq("user_id", user.id).maybeSingle();
      if (cancelled) return;
      if (err) {
        setError(err.message);
        return;
      }
      const g = (data as GuardRow) ?? null;
      setGuard(g);
      if (g?.id) {
        const { data: tips, error: tErr } = await supabase
          .from("tips")
          .select("id, amount_cents, status, created_at")
          .eq("guard_id", g.id)
          .order("created_at", { ascending: false })
          .limit(12);
        if (!cancelled && !tErr && tips) setRecentTips(tips as TipRow[]);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [user?.id]);

  useEffect(() => {
    if (!guard?.id) return;
    let cancelled = false;
    (async () => {
      const keys: string[] = [];
      for (let i = 13; i >= 0; i--) {
        const d = new Date();
        d.setDate(d.getDate() - i);
        d.setHours(0, 0, 0, 0);
        keys.push(d.toISOString().slice(0, 10));
      }
      const since = `${keys[0]}T00:00:00.000Z`;
      const { data, error: qErr } = await supabase
        .from("tips")
        .select("amount_cents, created_at")
        .eq("guard_id", guard.id)
        .eq("status", "succeeded")
        .gte("created_at", since);
      if (cancelled || qErr || !data) return;
      const totals: Record<string, number> = Object.fromEntries(keys.map((k) => [k, 0]));
      for (const row of data) {
        const day = (row.created_at as string).slice(0, 10);
        if (totals[day] != null) totals[day] += row.amount_cents as number;
      }
      setSparkValues(keys.map((k) => totals[k] ?? 0));
    })();
    return () => {
      cancelled = true;
    };
  }, [guard?.id]);

  async function onRequestPayout(e: FormEvent) {
    e.preventDefault();
    setToast(null);
    const raw = payoutAmount.replace(/\D/g, "");
    const rands = Number(raw || "0");
    const cents = Math.round(rands * 100);
    if (cents < 100) {
      setToast("Enter at least R1.");
      return;
    }
    setPayoutBusy(true);
    const { data, error: fnErr } = await supabase.functions.invoke("request-payout", {
      body: { amount_cents: cents },
    });
    setPayoutBusy(false);
    if (fnErr) {
      setToast(fnErr.message);
      return;
    }
    const msg = (data as { message?: string })?.message ?? "Payout request submitted.";
    setToast(msg);
  }

  if (error) {
    return (
      <div className="shell mx-auto max-w-lg px-5 py-8">
        <div className="error">{error}</div>
        <Link to="/" className="mt-4 inline-block text-amber-400">
          Home
        </Link>
      </div>
    );
  }

  if (!guard) {
    return (
      <div className="shell mx-auto flex max-w-lg flex-col gap-4 px-5 py-10">
        <h2 className="text-xl font-bold text-white">Finish guard profile</h2>
        <p className="text-sm text-slate-400">We could not find a guard profile linked to your account yet.</p>
        <Link
          className="rounded-2xl bg-gradient-to-r from-amber-400 to-amber-600 py-3 text-center font-black text-black"
          to="/guard/setup"
        >
          Create guard profile
        </Link>
        <button className="rounded-2xl border border-white/15 py-3 font-semibold text-slate-200" type="button" onClick={() => void signOut()}>
          Sign out
        </button>
      </div>
    );
  }

  const first = guard.display_name.split(" ")[0];

  return (
    <div className="shell mx-auto max-w-lg space-y-5 px-5 py-8 pb-16">
      <header className="fx-fade-up flex flex-wrap items-end justify-between gap-2">
        <div>
          <p className="text-xs font-bold uppercase tracking-wider text-slate-500">Guard dashboard</p>
          <h1 className="fx-gradient-text text-2xl font-black tracking-tight">Hi {first}</h1>
          <p className="text-sm text-slate-400">{guard.location}</p>
        </div>
        <span
          className={`rounded-full px-3 py-1 text-xs font-bold ${
            guard.verified ? "bg-emerald-500/15 text-emerald-400" : "bg-amber-500/15 text-amber-300"
          }`}
        >
          {guard.verified ? "Verified" : "Pending"}
        </span>
      </header>

      <TrustRibbon />

      <GlassPanel className="fx-fade-up" glow="amber">
        <p className="text-[10px] font-bold uppercase tracking-wider text-slate-500">14-day tip volume (ZAR)</p>
        <Sparkline values={sparkValues} height={44} />
        <p className="mt-1 text-xs text-slate-500">Daily totals from successful tips — heatmap-style chart ships next.</p>
      </GlassPanel>

      <section className="grid grid-cols-2 gap-3">
        <GlassPanel glow="amber" className="fx-fade-up">
          <p className="text-xs font-semibold uppercase text-slate-500">Wallet</p>
          <p className="mt-1 text-2xl font-black text-amber-400">{zarFromCents(guard.balance_cents)}</p>
          <p className="mt-1 text-[10px] text-slate-500">Secured ledger · payouts reviewed</p>
        </GlassPanel>
        <GlassPanel glow="slate" className="fx-fade-up">
          <p className="text-xs font-semibold uppercase text-slate-500">Tips</p>
          <p className="mt-1 text-2xl font-black text-white">{guard.tips_count}</p>
          <p className="text-xs text-slate-500">{guard.rating.toFixed(1)}★ avg</p>
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
            <p className="text-sm text-slate-500">No tips yet — share your QR from the QR screen.</p>
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

      <nav className="grid grid-cols-2 gap-2">
        <Link
          to="/guard/qr"
          className="rounded-xl border border-amber-500/30 bg-amber-500/10 py-3 text-center text-sm font-bold text-amber-200"
        >
          QR & links
        </Link>
        <Link to="/guard/profile" className="rounded-xl border border-white/10 py-3 text-center text-sm font-semibold text-slate-200">
          Profile
        </Link>
        <Link to="/guard/connect" className="rounded-xl border border-white/10 py-3 text-center text-sm font-semibold text-slate-200">
          Connect
        </Link>
        <Link to="/guard/history" className="rounded-xl border border-white/10 py-3 text-center text-sm font-semibold text-slate-200">
          Transactions
        </Link>
      </nav>

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

      <div className="flex gap-2">
        <button className="flex-1 rounded-2xl border border-white/10 py-3 text-sm font-semibold text-slate-300" type="button" onClick={() => void signOut()}>
          Sign out
        </button>
        <Link className="flex flex-1 items-center justify-center rounded-2xl border border-white/10 py-3 text-sm font-semibold text-amber-400" to="/">
          Home
        </Link>
      </div>
    </div>
  );
}
