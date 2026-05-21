import { type FormEvent, useEffect, useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { supabase } from "../lib/supabase";
import { useAuth } from "../context/useAuth";
import PageLoader from "../components/PageLoader";

/** Creates the first `merchants` row for the signed-in user (RLS: insert own `user_id` only). */
export default function MerchantSetup() {
  const { user, hasMerchantRow, loading, refreshProfile } = useAuth();
  const navigate = useNavigate();
  const [businessName, setBusinessName] = useState("");
  const [location, setLocation] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (loading) return;
    if (!user) navigate("/login", { replace: true, state: { from: "/merchant/setup" } });
    else if (hasMerchantRow) navigate("/merchant", { replace: true });
  }, [loading, user, hasMerchantRow, navigate]);

  if (loading || !user || hasMerchantRow) {
    return <PageLoader />;
  }

  async function onSubmit(e: FormEvent) {
    e.preventDefault();
    if (!user) return;
    setError(null);
    const name = businessName.trim();
    if (!name) {
      setError("Enter a business or venue name.");
      return;
    }
    setBusy(true);
    const { data: row, error: insErr } = await supabase
      .from("merchants")
      .insert({
        user_id: user.id,
        business_name: name,
        location: location.trim() || null,
      })
      .select("id")
      .single();
    if (insErr) {
      setBusy(false);
      setError(insErr.message);
      return;
    }
    if (row?.id) {
      const { error: kycErr } = await supabase.from("kyc_cases").insert({
        party_type: "merchant",
        party_id: row.id,
        status: "draft",
        data: {},
      });
      if (kycErr) {
        setBusy(false);
        await refreshProfile();
        setError(
          `Venue saved, but verification setup failed (${kycErr.message}). Open Venue verification from the merchant dashboard; it will create your case when the database is ready.`,
        );
        return;
      }
    }
    setBusy(false);
    await refreshProfile();
    navigate("/merchant", { replace: true });
  }

  return (
    <div className="shell mx-auto max-w-lg space-y-4 px-5 py-10 pb-16">
      <p className="muted-label" style={{ marginBottom: 0 }}>
        Onboarding · Step 1 of 3
      </p>
      <h2 className="text-2xl font-bold text-white">Register your business</h2>
      <ol className="flex gap-2 text-xs text-slate-500">
        <li className="font-bold text-amber-400">1 Venue</li>
        <li>2 Verification</li>
        <li>3 Guards &amp; QR</li>
      </ol>
      <p className="text-sm leading-relaxed text-slate-400">
        This creates your TipGuard venue record. After saving, complete <strong className="text-slate-200">venue verification</strong> from
        the merchant dashboard (required for operator review before go-live).
      </p>
      <form className="stack mt-4 space-y-3" onSubmit={onSubmit}>
        <input
          className="field min-h-[48px] w-full rounded-xl border border-white/10 bg-black/30 px-3 py-3 text-white"
          placeholder="Business or venue name"
          value={businessName}
          onChange={(e) => setBusinessName(e.target.value)}
          required
        />
        <input
          className="field min-h-[48px] w-full rounded-xl border border-white/10 bg-black/30 px-3 py-3 text-white"
          placeholder="Location (optional)"
          value={location}
          onChange={(e) => setLocation(e.target.value)}
        />
        {error && <div className="error">{error}</div>}
        {error?.includes("Venue saved") && (
          <Link className="inline-flex min-h-[48px] items-center text-sm font-bold text-amber-400 underline-offset-2 hover:underline" to="/merchant/kyc">
            Open venue verification
          </Link>
        )}
        <button className="btn-gold min-h-[48px] w-full rounded-2xl font-black" type="submit" disabled={busy}>
          {busy ? "Saving…" : "Save and continue"}
        </button>
      </form>
      <Link className="text-sm text-slate-500" to="/">
        Home
      </Link>
    </div>
  );
}
