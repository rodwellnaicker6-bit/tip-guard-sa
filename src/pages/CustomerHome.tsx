import { useEffect, useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { supabase } from "../lib/supabase";
import { useAuth } from "../context/useAuth";
import { Skeleton } from "../components/Skeleton";
import EmptyState from "../components/EmptyState";
import { TrustRibbon } from "../components/fintech/TrustRibbon";

/** Public listing / checkout (no ledger fields). */
export type PublicGuardRow = {
  id: string;
  display_name: string;
  location: string | null;
  province: string | null;
  avatar_initials: string | null;
  verified: boolean;
  rating: number;
  tips_count: number;
};

/** Guard dashboard row (includes wallet balance from own `guards` select). */
export type GuardRow = PublicGuardRow & { balance_cents: number };

export default function CustomerHome() {
  const { user } = useAuth();
  const navigate = useNavigate();
  const [guards, setGuards] = useState<PublicGuardRow[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      setLoading(true);
      const { data, error: err } = await supabase.rpc("list_public_guards");
      if (cancelled) return;
      if (err) setError(err.message);
      else setGuards((data as PublicGuardRow[]) ?? []);
      setLoading(false);
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  function goTip(g: PublicGuardRow) {
    if (!user) {
      sessionStorage.setItem("tipguard_redirect", `/customer/tip/${g.id}`);
      navigate("/login");
      return;
    }
    navigate(`/customer/tip/${g.id}`);
  }

  return (
    <div className="shell relative mx-auto max-w-lg space-y-5 px-5 py-8 pb-32">
      <div className="fx-fade-up flex flex-col gap-2">
        <p className="text-xs font-bold uppercase tracking-wider text-slate-500">Discover</p>
        <h1 className="fx-gradient-text text-3xl font-black tracking-tight">Verified guards</h1>
        <p className="text-sm leading-relaxed text-slate-400">
          Tap to tip in seconds. Checkout is encrypted; Apple Pay &amp; Google Pay show when your gateway enables wallet
          rails on your device.
        </p>
      </div>

      <TrustRibbon />

      {!user && (
        <div className="fx-fade-up rounded-2xl border border-emerald-500/25 bg-emerald-500/10 px-4 py-3 text-sm text-emerald-100/90">
          Sign in to send a tip — an account is required for PCI-aligned checkout.
        </div>
      )}
      {error && <div className="error">{error}</div>}
      {loading && (
        <div className="mt-2 space-y-2">
          {[0, 1, 2].map((i) => (
            <Skeleton key={i} style={{ height: 88, width: "100%", borderRadius: 18 }} />
          ))}
        </div>
      )}
      {!loading && guards.length === 0 && !error && (
        <EmptyState
          title="No guards listed yet"
          description="When guards complete onboarding and your operator verifies them, they will appear here."
        />
      )}
      <div className="space-y-3">
        {!loading &&
          guards.map((g) => (
            <button
              type="button"
              key={g.id}
              className="fx-fade-up flex w-full min-h-[4.5rem] cursor-pointer gap-3 rounded-2xl border border-white/10 bg-white/[0.04] p-4 text-left shadow-lg shadow-black/20 backdrop-blur-md transition active:scale-[0.99] hover:border-amber-500/30"
              onClick={() => goTip(g)}
            >
              <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-xl bg-gradient-to-br from-amber-400 to-amber-600 text-sm font-black text-black">
                {g.avatar_initials ?? "TG"}
              </div>
              <div className="min-w-0 flex-1">
                <div className="flex items-start justify-between gap-2">
                  <strong className="truncate text-base text-white">{g.display_name}</strong>
                  <span className="shrink-0 rounded-full bg-emerald-500/15 px-2 py-0.5 text-[10px] font-bold uppercase text-emerald-300">
                    Verified
                  </span>
                </div>
                <p className="mt-1 truncate text-xs text-slate-500">
                  {g.location ?? "South Africa"} · {g.rating.toFixed(1)}★ · {g.tips_count} tips
                </p>
              </div>
            </button>
          ))}
      </div>
      <div className="flex flex-wrap gap-3 text-sm font-semibold">
        {user && (
          <>
            <Link className="text-amber-400" to="/customer/dashboard">
              Dashboard
            </Link>
            <Link className="text-amber-400" to="/customer/history">
              History
            </Link>
            <Link className="text-amber-400" to="/customer/wallet">
              Wallet
            </Link>
            <Link className="text-slate-400" to="/settings">
              Account
            </Link>
          </>
        )}
        <Link className="text-slate-500" to="/">
          Home
        </Link>
      </div>

    </div>
  );
}
