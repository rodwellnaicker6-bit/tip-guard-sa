import { useEffect, useMemo, useState, type FormEvent } from "react";
import { Link, useLocation, useNavigate } from "react-router-dom";
import { useAuth } from "../context/useAuth";
import { GlassPanel } from "../components/fintech/GlassPanel";
import PaystackTestBanner from "../components/PaystackTestBanner";
import { supabase } from "../lib/supabase";
import { pathAfterSignIn } from "../lib/postAuthRedirect";
import { isProfileComplete, profileCompletionPercent } from "../lib/profileCompletion";
import { normalizeZaPhone } from "../lib/normalizeZaPhone";

type LocationState = { registeredRole?: "customer" | "guard" | "merchant" };
type IntentRole = "customer" | "guard" | "merchant";

const STEPS = ["role", "profile", "finish"] as const;
type Step = (typeof STEPS)[number];

export default function Onboarding() {
  const { user, role, profileFields, hasGuardRow, hasMerchantRow, loading, refreshProfile } = useAuth();
  const navigate = useNavigate();
  const location = useLocation();
  const reg = (location.state as LocationState | null)?.registeredRole;

  const initialIntent: IntentRole = useMemo(() => {
    if (reg === "guard" || role === "guard") return "guard";
    if (reg === "merchant" || role === "merchant") return "merchant";
    return "customer";
  }, [reg, role]);

  const [step, setStep] = useState<Step>("role");
  const [intent, setIntent] = useState<IntentRole>(initialIntent);
  const [saveError, setSaveError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (loading) return;
    if (!user) {
      navigate("/login", { replace: true, state: { from: "/onboarding" } });
    }
  }, [loading, user, navigate]);

  const effectiveStep: Step =
    step === "finish" && !isProfileComplete(profileFields) ? "profile" : step;

  const profileDone = isProfileComplete(profileFields);
  const profilePct = profileCompletionPercent(profileFields);
  const roleDone =
    intent === "merchant" ? hasMerchantRow : intent === "guard" ? hasGuardRow : true;
  const allDone = profileDone && roleDone;

  async function saveProfile(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    if (!user?.id) return;
    const fd = new FormData(e.currentTarget);
    const name = String(fd.get("full_name") ?? "").trim();
    const phoneRaw = String(fd.get("phone") ?? "").trim();
    if (name.length < 2) {
      setSaveError("Enter your display name (at least 2 characters).");
      return;
    }
    setSaving(true);
    setSaveError(null);
    let phoneVal: string | null = null;
    if (phoneRaw) {
      try {
        phoneVal = normalizeZaPhone(phoneRaw);
      } catch {
        setSaveError("Enter a valid South African mobile number or leave blank.");
        setSaving(false);
        return;
      }
    }
    const { error } = await supabase
      .from("profiles")
      .update({ full_name: name, phone: phoneVal })
      .eq("id", user.id);
    setSaving(false);
    if (error) {
      setSaveError(error.message);
      return;
    }
    await refreshProfile();
    setStep("finish");
  }

  function finishOnboarding() {
    navigate(
      pathAfterSignIn(role ?? intent, hasGuardRow, hasMerchantRow, profileFields),
      { replace: true },
    );
  }

  if (loading || !user) {
    return (
      <div className="shell mx-auto max-w-lg px-5 py-10">
        <p className="text-slate-400">Loading your account…</p>
      </div>
    );
  }

  const stepIndex = STEPS.indexOf(effectiveStep) + 1;

  return (
    <div className="shell mx-auto max-w-lg space-y-4 px-5 py-8 pb-20">
      <PaystackTestBanner />
      <header className="fx-fade-up text-center">
        <p className="muted-label">
          Step {stepIndex} of {STEPS.length}
        </p>
        <h2 className="fx-gradient-text text-2xl font-black">Welcome to TipGuard</h2>
        <p className="mt-2 text-sm text-slate-400">
          {user.email ? (
            <>
              Signed in as <span className="font-semibold text-slate-200">{user.email}</span>
            </>
          ) : (
            "Complete setup to start tipping or receiving."
          )}
        </p>
      </header>

      <div className="fx-fade-up flex justify-center gap-2" aria-hidden>
        {STEPS.map((s) => (
          <span
            key={s}
            className={`h-1.5 w-10 rounded-full ${STEPS.indexOf(s) <= STEPS.indexOf(effectiveStep) ? "bg-amber-400" : "bg-white/10"}`}
          />
        ))}
      </div>

      {effectiveStep === "role" && (
        <GlassPanel className="fx-fade-up space-y-3" glow="amber">
          <p className="text-xs font-bold uppercase text-amber-300/90">How will you use TipGuard?</p>
          {(["customer", "guard", "merchant"] as const).map((r) => (
            <label
              key={r}
              className={`flex cursor-pointer items-center gap-3 rounded-xl border px-4 py-3 ${
                intent === r ? "border-amber-400/60 bg-amber-500/10" : "border-white/10 bg-black/20"
              }`}
            >
              <input
                type="radio"
                name="intent"
                className="sr-only"
                checked={intent === r}
                onChange={() => setIntent(r)}
              />
              <span className="text-sm font-semibold text-white capitalize">{r}</span>
              <span className="ml-auto text-xs text-slate-500">
                {r === "customer" ? "Send tips" : r === "guard" ? "Receive tips" : "Manage a venue"}
              </span>
            </label>
          ))}
          <button type="button" className="btn-gold tap-target w-full rounded-2xl py-3 font-black" onClick={() => setStep("profile")}>
            Continue
          </button>
        </GlassPanel>
      )}

      {effectiveStep === "profile" && (
        <GlassPanel className="fx-fade-up space-y-4" glow="slate">
          <p className="text-xs font-bold uppercase text-slate-400">Profile basics · {profilePct}%</p>
          <form
            key={`${user.id}-${profileFields.full_name ?? ""}-${profileFields.phone ?? ""}`}
            className="space-y-3"
            onSubmit={(e) => void saveProfile(e)}
          >
            <label className="block">
              <span className="text-xs text-slate-500">Display name</span>
              <input
                className="field tap-target mt-1 w-full"
                name="full_name"
                defaultValue={profileFields.full_name ?? ""}
                autoComplete="name"
                required
                minLength={2}
              />
            </label>
            <label className="block">
              <span className="text-xs text-slate-500">Mobile (optional)</span>
              <input
                className="field tap-target mt-1 w-full"
                name="phone"
                type="tel"
                inputMode="tel"
                defaultValue={profileFields.phone ?? ""}
                autoComplete="tel"
                placeholder="e.g. 082 123 4567"
              />
            </label>
            {saveError && <div className="error text-sm">{saveError}</div>}
            <button type="submit" className="btn-gold tap-target w-full rounded-2xl py-3 font-black" disabled={saving}>
              {saving ? "Saving…" : "Save & continue"}
            </button>
          </form>
          <button type="button" className="text-sm text-slate-500 underline" onClick={() => setStep("role")}>
            ← Back
          </button>
        </GlassPanel>
      )}

      {effectiveStep === "finish" && (
        <>
          <GlassPanel className={`fx-fade-up onboard-step ${profileDone ? "onboard-step--done" : ""}`} glow="slate">
            <p className="text-xs font-bold uppercase text-slate-400">Profile</p>
            <p className="mt-1 text-sm text-slate-400">
              {profileDone ? "Display name saved." : "Add your name in the previous step or "}
              {!profileDone && (
                <button type="button" className="font-bold text-amber-400" onClick={() => setStep("profile")}>
                  edit profile
                </button>
              )}
            </p>
          </GlassPanel>

          {intent === "merchant" ? (
            <GlassPanel className={`fx-fade-up onboard-step ${roleDone ? "onboard-step--done" : ""}`} glow="amber">
              <p className="text-xs font-bold uppercase text-amber-300/90">Venue</p>
              <p className="mt-1 text-sm text-slate-400">
                {hasMerchantRow ? "Venue registered." : "Add your business to enable venue tipping."}
              </p>
              <Link
                className="btn-gold tap-target mt-4 block text-center no-underline"
                to={hasMerchantRow ? "/merchant" : "/merchant/setup"}
              >
                {hasMerchantRow ? "Open merchant dashboard" : "Register venue"}
              </Link>
            </GlassPanel>
          ) : intent === "guard" ? (
            <GlassPanel className={`fx-fade-up onboard-step ${roleDone ? "onboard-step--done" : ""}`} glow="amber">
              <p className="text-xs font-bold uppercase text-amber-300/90">Guard profile</p>
              <p className="mt-1 text-sm text-slate-400">
                {hasGuardRow ? "Guard profile ready." : "Add your display name and area for customers."}
              </p>
              <Link
                className="btn-gold tap-target mt-4 block text-center no-underline"
                to={hasGuardRow ? "/guard" : "/guard/setup"}
              >
                {hasGuardRow ? "Open guard dashboard" : "Complete guard profile"}
              </Link>
            </GlassPanel>
          ) : (
            <GlassPanel className="fx-fade-up onboard-step onboard-step--done" glow="emerald">
              <p className="text-xs font-bold uppercase text-emerald-300/80">Ready to tip</p>
              <p className="mt-1 text-sm text-slate-400">Browse verified guards and pay with Paystack in ZAR.</p>
            </GlassPanel>
          )}

          {profileDone && (
            <button
              type="button"
              className="btn-gold tap-target fx-fade-up w-full rounded-2xl py-4 font-black"
              onClick={finishOnboarding}
            >
              {allDone ? "Go to dashboard" : "Continue to app"}
            </button>
          )}

          {allDone && (
            <p className="fx-fade-up text-center text-sm text-emerald-400/90">You are ready for beta.</p>
          )}
        </>
      )}

      <Link className="block text-center text-sm text-slate-500" to="/settings">
        Account settings
      </Link>
    </div>
  );
}
