import { memo, useCallback, useEffect, useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { DASHBOARD_LOAD_TIMEOUT_MS, RPC_DEFAULT_TIMEOUT_MS, withOperationTimeout } from "../lib/operationTimeout";
import { supabase } from "../lib/supabase";
import { useAuth } from "../context/useAuth";
import { TrustRibbon } from "../components/fintech/TrustRibbon";
import { getLoyaltySnapshot } from "../lib/loyalty";
import { zarFromCents } from "../lib/money";
import { StatCardsSkeleton } from "../components/StatCardsSkeleton";
import { ProfileCompletionCard } from "../components/ProfileCompletionCard";
import { FetchError } from "../components/FetchError";
import EmptyState from "../components/EmptyState";
import { DashboardStatTile } from "../components/dashboard/DashboardStatTile";
import { GlassPanel } from "../components/fintech/GlassPanel";
import { SlowLoadHint } from "../components/SlowLoadHint";
import { useUiWatchdog } from "../lib/uiWatchdog";
import { useSupabaseQueryPage } from "../hooks/useSupabaseQueryPage";

type CustomerTipStats = { tip_count?: number; volume_cents?: number };

function isMissingRpcError(err: { code?: string; message?: string } | null): boolean {
  if (!err) return false;
  if (err.code === "PGRST202") return true;
  const msg = (err.message ?? "").toLowerCase();
  return (
    msg.includes("could not find the function") ||
    (msg.includes("function") && msg.includes("not found"))
  );
}

function CustomerDashboardPage() {
  useSupabaseQueryPage("customer-tips");
  const { user, profileFields, signOut, sessionReady } = useAuth();
  const email = user?.email ?? "your account";
  const [tipCount, setTipCount] = useState<number | null>(null);
  const [volume, setVolume] = useState<number | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [reload, setReload] = useState(0);
  const loyalty = getLoyaltySnapshot();
  const slowLoad = useUiWatchdog(loading);
  const onRetry = useCallback(() => setReload((n) => n + 1), []);
  const volumeLabel = useMemo(
    () => (volume != null ? zarFromCents(volume) : "R 0.00"),
    [volume],
  );

  useEffect(() => {
    if (!sessionReady || !user?.id) return;
    let cancelled = false;
    (async () => {
      setLoading(true);
      setError(null);
      try {
        let stats: CustomerTipStats | null = null;
        let qErr: { code?: string; message?: string } | null = null;

        const rpcRes = await withOperationTimeout(
          "dashboard",
          "get_customer_tip_stats",
          (signal) => supabase.rpc("get_customer_tip_stats").abortSignal(signal),
          RPC_DEFAULT_TIMEOUT_MS,
          undefined,
          { queued: false },
        );
        qErr = rpcRes.error;
        if (!qErr && rpcRes.data && typeof rpcRes.data === "object" && !Array.isArray(rpcRes.data)) {
          stats = rpcRes.data as CustomerTipStats;
        } else if (isMissingRpcError(qErr)) {
          const fallback = await withOperationTimeout(
            "dashboard",
            "customer tip stats fallback",
            (signal) =>
              supabase
                .from("tips")
                .select("amount_cents")
                .eq("payer_id", user.id)
                .eq("status", "succeeded")
                .abortSignal(signal),
            DASHBOARD_LOAD_TIMEOUT_MS,
            undefined,
            { queued: false },
          );
          qErr = fallback.error;
          if (!qErr) {
            const rows = fallback.data ?? [];
            stats = {
              tip_count: rows.length,
              volume_cents: rows.reduce((s, r) => s + (r.amount_cents as number), 0),
            };
          }
        }

        if (cancelled) return;
        if (qErr || !stats) {
          setError("We could not load your tip stats. Check your connection and try again.");
          setTipCount(null);
          setVolume(null);
        } else {
          setTipCount(stats.tip_count ?? 0);
          setVolume(Number(stats.volume_cents ?? 0));
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

  const statsReady = !loading && !error;

  return (
    <div className="shell dashboard-hub mx-auto max-w-lg space-y-5 px-4 py-6 sm:px-5">
      <header className="page-header">
        <p className="muted-label">Wallet hub</p>
        <h1 className="font-black tracking-tight text-amber-100">Your dashboard</h1>
        <p className="mt-1 text-sm text-slate-400">
          Signed in as <span className="font-semibold text-slate-200">{email}</span>
        </p>
      </header>

      <TrustRibbon />

      <ProfileCompletionCard fields={profileFields} />

      {error ? <FetchError message={error} onRetry={onRetry} /> : null}

      {loading ? (
        <>
          <StatCardsSkeleton />
          <SlowLoadHint show={slowLoad} />
        </>
      ) : !error ? (
        <div className="grid grid-cols-2 gap-3">
          <DashboardStatTile label="Tips sent" value={String(tipCount ?? 0)} glow="amber" />
          <DashboardStatTile
            label="Lifetime volume"
            value={volumeLabel}
            glow="emerald"
            valueClassName="text-xl font-black text-amber-400"
          />
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

export default memo(CustomerDashboardPage);
