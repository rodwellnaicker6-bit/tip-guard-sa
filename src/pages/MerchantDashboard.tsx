import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { supabase } from "../lib/supabase";
import { useAuth } from "../context/useAuth";
import { PAYMENT_PROVIDERS } from "../lib/paymentProviders";

type MerchRow = {
  id: string;
  business_name: string;
  location: string | null;
  verified: boolean;
};

export default function MerchantDashboard() {
  const { user, role, signOut } = useAuth();
  const [merchant, setMerchant] = useState<MerchRow | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!user?.id) return;
    let cancelled = false;
    (async () => {
      const { data, error: err } = await supabase
        .from("merchants")
        .select("id, business_name, location, verified")
        .eq("user_id", user.id)
        .maybeSingle();
      if (cancelled) return;
      if (err) {
        setError(err.message);
        setMerchant(null);
      } else {
        setError(null);
        setMerchant((data as MerchRow) ?? null);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [user?.id]);

  if (error) {
    return (
      <div className="shell mx-auto max-w-lg space-y-4 px-5 py-10">
        <div className="error">{error}</div>
        <Link className="text-amber-400" to="/">
          Home
        </Link>
      </div>
    );
  }

  if (!merchant) {
    return (
      <div className="shell mx-auto max-w-lg space-y-4 px-5 py-10">
        <h2 className="text-xl font-bold text-white">Merchant</h2>
        <p className="text-sm text-slate-400">
          {role === "merchant"
            ? "Your account has the merchant role, but no venue row is linked yet."
            : "Add a venue profile to unlock this dashboard."}
        </p>
        <Link className="btn-gold inline-flex min-h-[48px] items-center justify-center rounded-2xl px-4 font-bold" to="/merchant/setup">
          {role === "merchant" ? "Complete venue registration" : "Register venue"}
        </Link>
        <Link className="block text-sm text-slate-500" to="/">
          Home
        </Link>
      </div>
    );
  }

  return (
    <div className="shell mx-auto max-w-lg space-y-5 px-5 py-8 pb-16">
      <h2 className="text-2xl font-bold text-white">{merchant.business_name}</h2>
      <p className="text-slate-400">{merchant.location ?? "South Africa"}</p>
      <div className="card stack rounded-2xl border border-white/10 bg-white/[0.04] p-4">
        <strong className="text-slate-200">Venue status</strong>
        <p className="mt-1 text-sm text-slate-400">
          {merchant.verified ? "Verified with TipGuard" : "Pending verification — contact your operator if this stays pending."}
        </p>
      </div>
      <div className="card stack rounded-2xl border border-amber-500/20 bg-amber-500/5 p-4">
        <strong className="text-amber-200">Compliance</strong>
        <p className="mt-1 text-sm text-slate-400">
          Submit venue details for operator review (POPIA-aligned self-attestation). Required before national rollout.
        </p>
        <Link
          className="mt-3 inline-flex min-h-[44px] items-center justify-center rounded-xl bg-amber-500/20 px-4 text-sm font-bold text-amber-200"
          to="/merchant/kyc"
        >
          Venue verification
        </Link>
      </div>
      <div className="card stack rounded-2xl border border-white/10 bg-white/[0.04] p-4">
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
      <div className="card stack rounded-2xl border border-white/10 bg-white/[0.04] p-4">
        <strong className="text-slate-200">Locations &amp; guards</strong>
        <p className="mt-1 text-sm text-slate-400">Manage sites and guard profiles linked to this venue.</p>
        <div className="mt-3 flex flex-wrap gap-3">
          <Link
            className="inline-flex min-h-[44px] items-center justify-center rounded-xl bg-white/10 px-4 text-sm font-bold text-amber-200"
            to="/merchant/locations"
          >
            Locations
          </Link>
          <Link
            className="inline-flex min-h-[44px] items-center justify-center rounded-xl bg-white/10 px-4 text-sm font-bold text-amber-200"
            to="/merchant/guards"
          >
            Guards
          </Link>
        </div>
      </div>
      <div className="flex flex-wrap gap-4 text-sm font-semibold">
        <Link className="text-amber-400" to="/settings">
          Account settings
        </Link>
        <Link className="text-slate-500" to="/">
          Home
        </Link>
        <button className="text-slate-400 underline-offset-2 hover:underline" type="button" onClick={() => void signOut()}>
          Sign out
        </button>
      </div>
    </div>
  );
}
