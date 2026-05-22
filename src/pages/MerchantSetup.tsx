import { type FormEvent, useEffect, useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { supabase } from "../lib/supabase";
import { useAuth } from "../context/useAuth";
import PageLoader from "../components/PageLoader";
import { sanitizeDisplayName } from "../lib/sanitize";

type Step = 1 | 2 | 3;

/** Multi-step merchant onboarding: business → locations → QR. */
export default function MerchantSetup() {
  const { user, hasMerchantRow, loading, refreshProfile } = useAuth();
  const navigate = useNavigate();
  const [step, setStep] = useState<Step>(1);
  const [merchantId, setMerchantId] = useState<string | null>(null);
  const [businessName, setBusinessName] = useState("");
  const [location, setLocation] = useState("");
  const [siteName, setSiteName] = useState("");
  const [siteAddress, setSiteAddress] = useState("");
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

  async function saveBusiness(e: FormEvent) {
    e.preventDefault();
    if (!user) return;
    const name = businessName.trim();
    if (!name) {
      setError("Enter a business or venue name.");
      return;
    }
    setBusy(true);
    setError(null);
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
      await supabase.from("kyc_cases").insert({
        party_type: "merchant",
        party_id: row.id,
        status: "draft",
        data: {},
      });
      setMerchantId(row.id);
    }
    setBusy(false);
    await refreshProfile();
    setStep(2);
  }

  async function saveLocation(e: FormEvent) {
    e.preventDefault();
    if (!merchantId || !siteName.trim()) {
      setError("Enter a location name.");
      return;
    }
    setBusy(true);
    setError(null);
    const { error: insErr } = await supabase.from("merchant_locations").insert({
      merchant_id: merchantId,
      name: sanitizeDisplayName(siteName),
      address: siteAddress.trim() ? sanitizeDisplayName(siteAddress) : null,
    });
    setBusy(false);
    if (insErr) setError(insErr.message);
    else {
      setSiteName("");
      setSiteAddress("");
      setStep(3);
    }
  }

  async function skipToQr() {
    setStep(3);
  }

  async function createStarterQr() {
    if (!merchantId) return;
    setBusy(true);
    const token = `tg_${crypto.randomUUID().replace(/-/g, "")}`;
    const { error: insErr } = await supabase.from("qr_codes").insert({
      merchant_id: merchantId,
      code_token: token,
      label: "Main venue QR",
      qr_type: "merchant_permanent",
    });
    setBusy(false);
    if (insErr) {
      setError(insErr.message);
      return;
    }
    await refreshProfile();
    navigate("/merchant/qr", { replace: true });
  }

  return (
    <div className="shell mx-auto max-w-lg space-y-4 px-5 py-10 pb-16">
      <p className="muted-label" style={{ marginBottom: 0 }}>
        Merchant setup · Step {step} of 3
      </p>
      <ol className="flex flex-wrap gap-2 text-xs text-slate-500" aria-label="Setup steps">
        <li className={step === 1 ? "font-bold text-amber-400" : ""}>1 Venue profile</li>
        <li className={step === 2 ? "font-bold text-amber-400" : ""}>2 Sites & branches</li>
        <li className={step === 3 ? "font-bold text-amber-400" : ""}>3 Payment QR</li>
      </ol>

      {step === 1 && (
        <>
          <h2 className="text-2xl font-bold text-white">Venue profile</h2>
          <p className="text-sm leading-relaxed text-slate-400">
            Register your business on TipGuard. You can accept tips after venue verification is approved.
          </p>
          <form className="stack mt-4 space-y-3" onSubmit={saveBusiness}>
            <input
              className="field min-h-[48px] w-full rounded-xl border border-white/10 bg-black/30 px-3 py-3 text-white"
              placeholder="Business or venue name"
              value={businessName}
              onChange={(e) => setBusinessName(e.target.value)}
              required
            />
            <input
              className="field min-h-[48px] w-full rounded-xl border border-white/10 bg-black/30 px-3 py-3 text-white"
              placeholder="City / region (optional)"
              value={location}
              onChange={(e) => setLocation(e.target.value)}
            />
            {error && <div className="error">{error}</div>}
            <button className="btn-gold min-h-[48px] w-full rounded-2xl font-black" type="submit" disabled={busy}>
              {busy ? "Saving…" : "Continue"}
            </button>
          </form>
        </>
      )}

      {step === 2 && (
        <>
          <h2 className="text-2xl font-bold text-white">Sites & branches</h2>
          <p className="text-sm text-slate-400">Add your first site now, or skip and manage locations from your dashboard later.</p>
          <form className="stack mt-4 space-y-3" onSubmit={saveLocation}>
            <input
              className="field w-full"
              placeholder="Location name"
              value={siteName}
              onChange={(e) => setSiteName(e.target.value)}
            />
            <input
              className="field w-full"
              placeholder="Address (optional)"
              value={siteAddress}
              onChange={(e) => setSiteAddress(e.target.value)}
            />
            {error && <div className="error">{error}</div>}
            <button className="btn-gold w-full rounded-2xl py-3 font-black" type="submit" disabled={busy}>
              {busy ? "Saving…" : "Save location & continue"}
            </button>
            <button type="button" className="btn-ghost w-full py-3 text-sm" onClick={() => void skipToQr()}>
              Skip for now
            </button>
          </form>
        </>
      )}

      {step === 3 && (
        <>
          <h2 className="text-2xl font-bold text-white">Payment QR</h2>
          <p className="text-sm text-slate-400">Create a permanent QR for your venue. Print it or assign codes to your team from the QR manager.</p>
          {error && <div className="error">{error}</div>}
          <button className="btn-gold w-full rounded-2xl py-3 font-black" type="button" disabled={busy} onClick={() => void createStarterQr()}>
            {busy ? "Creating…" : "Create venue QR"}
          </button>
          <Link className="block text-center text-sm text-amber-400" to="/merchant/kyc">
            Start venue verification
          </Link>
        </>
      )}

      <Link className="text-sm text-slate-500" to="/">
        Home
      </Link>
    </div>
  );
}
