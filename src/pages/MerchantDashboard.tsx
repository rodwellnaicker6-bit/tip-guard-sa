import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { supabase } from "../lib/supabase";
import { useAuth } from "../context/useAuth";
import { PAYMENT_PROVIDERS } from "../lib/paymentProviders";
import PageLoader from "../components/PageLoader";
import { FetchError } from "../components/FetchError";

type MerchRow = {
  id: string;
  business_name: string;
  location: string | null;
  verified: boolean;
};

export default function MerchantDashboard() {
  const { user, role, signOut } = useAuth();
  const [merchant, setMerchant] = useState<MerchRow | null>(null);
  const [loading, setLoading] = useState(() => Boolean(user?.id));
  const [error, setError] = useState<string | null>(null);
  const [reload, setReload] = useState(0);

  useEffect(() => {
    if (!user?.id) return;
    let cancelled = false;
    (async () => {
      setLoading(true);
      setError(null);
      const { data, error: err } = await supabase
        .from("merchants")
        .select("id, business_name, location, verified")
        .eq("user_id", user.id)
        .maybeSingle();
      if (cancelled) return;
      if (err) {
        setError("We could not load your venue. Please try again.");
        setMerchant(null);
      } else {
        setMerchant((data as MerchRow) ?? null);
      }
      setLoading(false);
    })();
    return () => {
      cancelled = true;
    };
  }, [user?.id, reload]);

  if (loading) {
    return <PageLoader />;
  }

  if (error) {
    return (
      <div className="shell dashboard-hub mx-auto max-w-lg space-y-4 px-4 py-10 sm:px-5">
        <FetchError message={error} onRetry={() => setReload((n) => n + 1)} />
        <Link className="tap-target text-amber-400" to="/">
          Home
        </Link>
      </div>
    );
  }

  if (!merchant) {
    return (
      <div className="shell dashboard-hub mx-auto max-w-lg space-y-4 px-4 py-10 sm:px-5">
        <header className="page-header">
          <p className="muted-label">Merchant</p>
          <h2 className="font-black text-white">Venue hub</h2>
        </header>
        <p className="text-sm text-slate-400">
          {role === "merchant"
            ? "Your account has the merchant role, but no venue row is linked yet."
            : "Add a venue profile to unlock this dashboard."}
        </p>
        <Link className="btn-gold tap-target min-h-[48px] items-center justify-center rounded-2xl px-4 font-bold" to="/merchant/setup">
          {role === "merchant" ? "Complete venue registration" : "Register venue"}
        </Link>
        <Link className="tap-target block text-sm text-slate-500" to="/">
          Home
        </Link>
      </div>
    );
  }

  return (
    <div className="shell dashboard-hub mx-auto max-w-lg space-y-5 px-4 py-8 pb-16 sm:px-5">
      <header className="page-header fx-fade-up min-w-0">
        <p className="muted-label">Venue hub</p>
        <h2 className="font-black text-white break-words">{merchant.business_name}</h2>
        <p className="text-slate-400">{merchant.location ?? "South Africa"}</p>
      </header>

      <div className="card stack min-w-0 rounded-2xl border border-white/10 bg-white/[0.04] p-4">
        <strong className="text-slate-200">Venue status</strong>
        <p className="mt-1 text-sm text-slate-400">
          {merchant.verified ? "Verified with TipGuard" : "Pending verification — contact your operator if this stays pending."}
        </p>
      </div>

      <div className="card stack min-w-0 rounded-2xl border border-amber-500/20 bg-amber-500/5 p-4">
        <strong className="text-amber-200">Compliance</strong>
        <p className="mt-1 text-sm text-slate-400">
          Submit venue details for operator review (POPIA-aligned self-attestation). Required before national rollout.
        </p>
        <Link
          className="tap-target mt-3 inline-flex min-h-[44px] w-full items-center justify-center rounded-xl bg-amber-500/20 px-4 text-sm font-bold text-amber-200 sm:w-auto"
          to="/merchant/kyc"
        >
          Venue verification
        </Link>
      </div>

      <div className="card stack min-w-0 rounded-2xl border border-white/10 bg-white/[0.04] p-4">
        <strong className="text-slate-200">Payments</strong>
        <p className="mt-1 text-sm text-slate-400">
          Customer tips use Paystack on the guard checkout path. Additional providers are registered for upcoming work:
        </p>
        <ul className="mt-2 list-disc space-y-1 pl-5 text-sm text-slate-400">
          {PAYMENT_PROVIDERS.map((p) => (
            <li key={p.id}>
              <strong className="text-slate-200">{p.displayName}</strong>
              {p.productionReady ? " — active" : " — planned"}
            </li>
          ))}
        </ul>
      </div>

      <div className="card stack min-w-0 rounded-2xl border border-white/10 bg-white/[0.04] p-4">
        <strong className="text-slate-200">Locations &amp; guards</strong>
        <p className="mt-1 text-sm text-slate-400">Manage sites and guard profiles linked to this venue.</p>
        <div className="hub-nav-grid mt-3">
          <Link className="hub-nav-link bg-white/10 text-amber-200" to="/merchant/locations">
            Locations
          </Link>
          <Link className="hub-nav-link bg-white/10 text-amber-200" to="/merchant/guards">
            Guards
          </Link>
        </div>
      </div>

      <nav className="flex flex-wrap gap-4 text-sm font-semibold">
        <Link className="tap-target text-amber-400" to="/settings">
          Account settings
        </Link>
        <Link className="tap-target text-slate-500" to="/">
          Home
        </Link>
        <button className="tap-target text-slate-400 underline-offset-2 hover:underline" type="button" onClick={() => void signOut()}>
          Sign out
        </button>
      </nav>
    </div>
  );
}
