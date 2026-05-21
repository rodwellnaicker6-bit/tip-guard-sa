import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { supabase } from "../lib/supabase";
import { useAuth } from "../context/useAuth";
import { GlassPanel } from "../components/fintech/GlassPanel";
import { TrustRibbon } from "../components/fintech/TrustRibbon";
import { getLoyaltySnapshot } from "../lib/loyalty";
import { zarFromCents } from "../lib/money";
import { StatCardsSkeleton } from "../components/StatCardsSkeleton";
import { FetchError } from "../components/FetchError";
import EmptyState from "../components/EmptyState";

export default function CustomerDashboard() {
  const { user, signOut } = useAuth();
  const email = user?.email ?? "your account";
  const [tipCount, setTipCount] = useState<number | null>(null);
  const [volume, setVolume] = useState<number | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [reload, setReload] = useState(0);
  const loyalty = getLoyaltySnapshot();

  useEffect(() => {
    if (!user?.id) return;
    let cancelled = false;
    (async () => {
      setLoading(true);
      setError(null);
      const { data, error: qErr } = await supabase
        .from("tips")
        .select("amount_cents")
        .eq("payer_id", user.id)
        .eq("status", "succeeded");
      if (cancelled) return;
      if (qErr) {
        setError("We could not load your tip stats. Check your connection and try again.");
        setTipCount(null);
        setVolume(null);
      } else {
        const rows = data ?? [];
        setTipCount(rows.length);
        setVolume(rows.reduce((s, r) => s + (r.amount_cents as number), 0));
      }
      setLoading(false);
    })();
    return () => {
      cancelled = true;
    };
  }, [user?.id, reload]);

  const statsReady = !loading && !error;

  return (
    <div className="shell dashboard-hub mx-auto max-w-lg space-y-5 px-4 py-8 sm:px-5">
      <header className="page-header fx-fade-up">
        <p className="muted-label">Wallet hub</p>
        <h1 className="fx-gradient-text font-black tracking-tight">Your dashboard</h1>
        <p className="mt-1 text-sm text-slate-400">
          Signed in as <span className="font-semibold text-slate-200">{email}</span>
        </p>
      </header>

      <TrustRibbon />

      {error ? <FetchError message={error} onRetry={() => setReload((n) => n + 1)} /> : null}

      {loading ? (
        <StatCardsSkeleton />
      ) : !error ? (
        <div className="grid grid-cols-2 gap-3">
          <GlassPanel glow="amber" className="fx-fade-up min-w-0">
            <p className="text-[10px] font-bold uppercase tracking-wider text-slate-500">Tips sent</p>
            <p className="mt-1 text-2xl font-black text-white">{tipCount ?? 0}</p>
          </GlassPanel>
          <GlassPanel glow="emerald" className="fx-fade-up min-w-0">
            <p className="text-[10px] font-bold uppercase tracking-wider text-slate-500">Lifetime volume</p>
            <p className="mt-1 text-xl font-black text-amber-400">{volume != null ? zarFromCents(volume) : "R 0.00"}</p>
          </GlassPanel>
        </div>
      ) : null}

      {statsReady && tipCount === 0 ? (
        <EmptyState
          title="No tips yet"
          description="Find a verified guard and send your first tip in seconds."
          action={
            <Link className="hub-primary-cta bg-gradient-to-r from-amber-400 to-amber-600 text-black shadow-lg shadow-amber-500/25" to="/customer">
              Browse guards
            </Link>
          }
        />
      ) : null}

      <GlassPanel className="fx-fade-up" glow="slate">
        <p className="text-xs font-bold uppercase text-slate-500">Loyalty (device)</p>
        <p className="mt-1 text-sm text-slate-300">
          Streak <strong className="text-amber-400">{loyalty.streak}</strong> · Points{" "}
          <strong className="text-amber-400">{loyalty.points}</strong>
        </p>
        <p className="mt-2 text-xs text-slate-500">Server-backed rewards &amp; referrals ship next — this preview builds habit.</p>
      </GlassPanel>

      <GlassPanel className="fx-fade-up border-dashed border-amber-500/25" glow="amber">
        <p className="text-xs font-bold uppercase text-amber-200/80">Referrals</p>
        <p className="mt-1 text-sm text-slate-400">Invite friends after we wire unique referral codes to your profile.</p>
      </GlassPanel>

      <Link
        className="hub-primary-cta tap-target bg-gradient-to-r from-amber-400 to-amber-600 text-black shadow-lg shadow-amber-500/25"
        to="/customer"
      >
        Browse verified guards
      </Link>

      <nav className="hub-nav-grid" aria-label="Customer hub">
        <Link className="hub-nav-link text-amber-400" to="/customer/history">
          Tip history
        </Link>
        <Link className="hub-nav-link text-amber-400" to="/customer/wallet">
          Wallet
        </Link>
        <Link className="hub-nav-link text-amber-400" to="/customer/transactions">
          Ledger
        </Link>
        <Link className="hub-nav-link text-slate-300" to="/settings">
          Settings
        </Link>
      </nav>

      <button
        className="tap-target w-full rounded-2xl border border-white/10 py-3 text-sm font-semibold text-slate-400"
        type="button"
        onClick={() => void signOut()}
      >
        Sign out
      </button>
      <Link className="tap-target block text-center text-sm text-slate-500" to="/">
        Home
      </Link>
    </div>
  );
}
