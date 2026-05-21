import { type FormEvent, useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { supabase } from "../lib/supabase";
import { useAuth } from "../context/useAuth";
import PageLoader from "../components/PageLoader";
import { VerificationStatusBadge } from "../components/VerificationStatusBadge";

type MerchantRow = { id: string; business_name: string };
type KycRow = {
  id: string;
  status: string;
  data: Record<string, unknown> | null;
  updated_at: string;
};

/** Minimal merchant KYC: draft declaration → submitted for operator review (POPIA-aligned self-attestation). */
export default function MerchantKyc() {
  const { user } = useAuth();
  const [merchant, setMerchant] = useState<MerchantRow | null>(null);
  const [kyc, setKyc] = useState<KycRow | null>(null);
  const [companyReg, setCompanyReg] = useState("");
  const [vatNumber, setVatNumber] = useState("");
  const [declaration, setDeclaration] = useState("");
  const [confirmAccurate, setConfirmAccurate] = useState(false);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!user?.id) return;
    let cancelled = false;
    (async () => {
      setLoading(true);
      setError(null);
      const { data: m, error: mErr } = await supabase.from("merchants").select("id, business_name").eq("user_id", user.id).maybeSingle();
      if (cancelled) return;
      if (mErr || !m) {
        setError(mErr?.message ?? "No merchant profile found.");
        setMerchant(null);
        setLoading(false);
        return;
      }
      setMerchant(m as MerchantRow);

      const { data: k, error: kErr } = await supabase
        .from("kyc_cases")
        .select("id, status, data, updated_at")
        .eq("party_type", "merchant")
        .eq("party_id", m.id)
        .order("created_at", { ascending: false })
        .limit(1)
        .maybeSingle();

      if (cancelled) return;
      if (kErr && kErr.code !== "PGRST116") {
        setError(kErr.message);
        setLoading(false);
        return;
      }

      const noCase = !k && (!kErr || kErr.code === "PGRST116");
      if (noCase) {
        const { data: created, error: cErr } = await supabase
          .from("kyc_cases")
          .insert({ party_type: "merchant", party_id: m.id, status: "draft", data: {} })
          .select("id, status, data, updated_at")
          .single();
        if (cancelled) return;
        if (cErr) {
          setError(
            cErr.message.includes("kyc_cases") || cErr.code === "42P01"
              ? "KYC is not available until database migrations are applied."
              : cErr.message,
          );
          setKyc(null);
        } else {
          setKyc(created as KycRow);
        }
      } else {
        setKyc(k as KycRow);
      }

      const { data: fullMerch } = await supabase.from("merchants").select("company_registration, vat_number").eq("id", m.id).maybeSingle();
      if (!cancelled && fullMerch) {
        setCompanyReg(typeof fullMerch.company_registration === "string" ? fullMerch.company_registration : "");
        setVatNumber(typeof fullMerch.vat_number === "string" ? fullMerch.vat_number : "");
      }
      setLoading(false);
    })();
    return () => {
      cancelled = true;
    };
  }, [user?.id]);

  async function onSubmit(e: FormEvent) {
    e.preventDefault();
    if (!merchant || !kyc || kyc.status !== "draft") return;
    if (!confirmAccurate) {
      setError("Confirm that the information you provide is accurate.");
      return;
    }
    const dec = declaration.trim();
    if (dec.length < 20) {
      setError("Add a short business description (at least 20 characters) for reviewers.");
      return;
    }
    setBusy(true);
    setError(null);
    const { error: uErr } = await supabase
      .from("merchants")
      .update({
        company_registration: companyReg.trim() || null,
        vat_number: vatNumber.trim() || null,
      })
      .eq("id", merchant.id);
    if (uErr) {
      setBusy(false);
      setError(uErr.message);
      return;
    }
    const { error: kErr } = await supabase
      .from("kyc_cases")
      .update({
        status: "submitted",
        data: {
          declaration: dec,
          submitted_at: new Date().toISOString(),
          self_attestation: true,
        },
      })
      .eq("id", kyc.id)
      .eq("status", "draft");
    setBusy(false);
    if (kErr) {
      setError(kErr.message);
      return;
    }
    setKyc({ ...kyc, status: "submitted", data: { declaration: dec, submitted_at: new Date().toISOString(), self_attestation: true } });
  }

  if (loading) return <PageLoader />;

  if (!merchant) {
    return (
      <div className="shell mx-auto max-w-lg space-y-4 px-5 py-10">
        {error && <div className="error">{error}</div>}
        <Link className="text-amber-400" to="/merchant/setup">
          Register venue first
        </Link>
      </div>
    );
  }

  return (
    <div className="shell mx-auto max-w-lg space-y-5 px-5 py-8 pb-16">
      <header>
        <p className="text-xs font-bold uppercase tracking-wider text-slate-500">Compliance</p>
        <h1 className="text-2xl font-black text-white">Venue verification</h1>
        <p className="mt-1 text-sm text-slate-400">{merchant.business_name}</p>
      </header>

      {kyc && (
        <VerificationStatusBadge kycStatus={kyc.status} entityLabel="KYC case" />
      )}
      {kyc && (
        <p className="text-xs text-slate-500">Last update: {new Date(kyc.updated_at).toLocaleString()}</p>
      )}

      {error && <div className="error">{error}</div>}

      {kyc?.status === "draft" && (
        <form className="space-y-4" onSubmit={onSubmit}>
          <p className="text-sm leading-relaxed text-slate-400">
            For launch readiness we collect a self-attested declaration only. Formal document upload and automated
            checks can follow under your operator&apos;s POPIA policy.
          </p>
          <label className="block">
            <span className="text-xs text-slate-500">Company / trust registration (optional)</span>
            <input className="field mt-1 w-full" value={companyReg} onChange={(e) => setCompanyReg(e.target.value)} autoComplete="organization" />
          </label>
          <label className="block">
            <span className="text-xs text-slate-500">VAT number (optional)</span>
            <input className="field mt-1 w-full" value={vatNumber} onChange={(e) => setVatNumber(e.target.value)} autoComplete="off" />
          </label>
          <label className="block">
            <span className="text-xs text-slate-500">Business description</span>
            <textarea
              className="field mt-1 min-h-[100px] w-full resize-y"
              value={declaration}
              onChange={(e) => setDeclaration(e.target.value)}
              placeholder="What you operate, typical trading hours, and site contact."
              required
            />
          </label>
          <label className="flex cursor-pointer items-start gap-3 text-sm text-slate-300">
            <input type="checkbox" className="mt-1" checked={confirmAccurate} onChange={(e) => setConfirmAccurate(e.target.checked)} />
            <span>I confirm the information above is accurate to the best of my knowledge (required for submission).</span>
          </label>
          <button className="btn-gold min-h-[48px] w-full rounded-2xl py-3 font-black" type="submit" disabled={busy}>
            {busy ? "Submitting…" : "Submit for review"}
          </button>
        </form>
      )}

      {kyc && ["submitted", "in_review"].includes(kyc.status) && (
        <p className="text-sm text-slate-400">Your submission is with TipGuard operators. You will be notified when the status changes.</p>
      )}

      {kyc?.status === "approved" && <p className="text-sm text-emerald-300">This venue&apos;s verification case is approved.</p>}

      {kyc?.status === "rejected" && (
        <p className="text-sm text-red-300">This case was rejected. Contact your operator for next steps.</p>
      )}

      <div className="flex flex-wrap gap-4 text-sm font-semibold">
        <Link className="text-amber-400" to="/merchant">
          Dashboard
        </Link>
        <Link className="text-slate-500" to="/">
          Home
        </Link>
      </div>
    </div>
  );
}
