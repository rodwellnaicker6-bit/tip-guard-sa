import { useEffect, useMemo, useState, type FormEvent } from "react";
import { Link, useLocation, useNavigate } from "react-router-dom";
import { useAuth } from "../context/useAuth";
import type { AuthAccountSnapshot, AuthRole } from "../context/authTypes";
import { GlassPanel } from "../components/fintech/GlassPanel";
import PaystackTestBanner from "../components/PaystackTestBanner";
import { supabase } from "../lib/supabase";
import { pathAfterSignIn } from "../lib/postAuthRedirect";
import { isProfileComplete, profileCompletionPercent } from "../lib/profileCompletion";
import { normalizeZaPhone } from "../lib/normalizeZaPhone";
import { unwrapRpcSingle } from "../lib/rpcData";
import { stabilLog } from "../lib/stabilLog";

const ONBOARDING_SAVE_TIMEOUT_MS = 15_000;

function withSaveTimeout<T>(promise: PromiseLike<T>, label: string): Promise<T> {
  return Promise.race([
    Promise.resolve(promise),
    new Promise<T>((_, reject) => {
      window.setTimeout(
        () => reject(new Error(`${label} timed out. Check your connection and try again.`)),
        ONBOARDING_SAVE_TIMEOUT_MS,
      );
    }),
  ]);
}

type LocationState = { registeredRole?: "customer" | "guard" | "merchant" };
type IntentRole = "customer" | "guard" | "merchant";

const STEPS = ["role", "profile", "finish"] as const;
type Step = (typeof STEPS)[number];

function profileSaveErrorMessage(message: string, code?: string): string {
  let msg: string;
  if (/profile role cannot be changed/i.test(message)) {
    msg = "We could not save your role. Ask an admin to apply the latest database migration, then try again.";
  } else if (/permission denied|row-level security|42501/i.test(message)) {
    msg = "We could not save your profile (access denied). Sign out, sign in again, or contact support.";
  } else if (/network|fetch|failed to fetch|timeout/i.test(message)) {
    msg = "Network error while saving. Check your connection and try again.";
  } else if (/profile row missing|not authenticated/i.test(message)) {
    msg = "Your account profile is missing. Sign out, sign in again, then retry.";
  } else {
    msg = message;
  }
  if (import.meta.env.DEV && (code || message)) {
    return `${msg} [${code ?? "error"}: ${message}]`;
  }
  return msg;
}

export default function Onboarding() {
  const { user, role, profileFields, hasGuardRow, hasMerchantRow, sessionReady, refreshProfile } =
    useAuth();
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
    if (!sessionReady) return;
    if (!user) {
      navigate("/login", { replace: true, state: { from: "/onboarding" } });
    }
  }, [sessionReady, user, navigate]);

  const effectiveStep: Step =
    step === "finish" && !isProfileComplete(profileFields) ? "profile" : step;

  const profileDone = isProfileComplete(profileFields);
  const profilePct = profileCompletionPercent(profileFields);
  const roleDone =
    intent === "merchant" ? hasMerchantRow : intent === "guard" ? hasGuardRow : true;
  const allDone = profileDone && roleDone;

  function destinationForSnapshot(snap: AuthAccountSnapshot, chosenRole: IntentRole): string {
    const effectiveRole = snap.role ?? chosenRole;
    return pathAfterSignIn(effectiveRole, snap.hasGuardRow, snap.hasMerchantRow, snap.profileFields);
  }

  function tryLeaveOnboarding(snap: AuthAccountSnapshot, chosenRole: IntentRole): boolean {
    const dest = destinationForSnapshot(snap, chosenRole);
    if (dest === "/onboarding") return false;
    navigate(dest, { replace: true });
    return true;
  }

  async function continueFromRole() {
    if (!user?.id || saving) return;
    if (!sessionReady) {
      setSaveError("Still connecting your session. Wait a moment and try again.");
      return;
    }
    setSaving(true);
    setSaveError(null);

    try {
      stabilLog("auth", "onboarding role save start", { intent });

      const { data: savedRoleRaw, error: rpcErr } = await withSaveTimeout(
        supabase.rpc("save_onboarding_role", { p_role: intent }),
        "Role save",
      );

      let roleSaved = unwrapRpcSingle<string>(savedRoleRaw);

      if (rpcErr) {
        console.error("[Onboarding] save_onboarding_role", rpcErr.message, rpcErr.code);
        const { data: row, error: updErr } = await withSaveTimeout(
          supabase.from("profiles").update({ role: intent }).eq("id", user.id).select("role").maybeSingle(),
          "Profile update",
        );
        if (updErr) {
          setSaveError(profileSaveErrorMessage(updErr.message, updErr.code));
          if (import.meta.env.DEV) console.warn("[Onboarding] role save", rpcErr, updErr);
          return;
        }
        roleSaved = row?.role ?? null;
        if (!roleSaved) {
          const { error: insErr } = await supabase.from("profiles").insert({
            id: user.id,
            role: "customer",
            full_name:
              profileFields.full_name ??
              (typeof user.user_metadata?.full_name === "string" ? user.user_metadata.full_name : null) ??
              "Member",
          });
          if (insErr) {
            setSaveError(profileSaveErrorMessage(insErr.message, insErr.code));
            return;
          }
          const retry = await withSaveTimeout(
            supabase.from("profiles").update({ role: intent }).eq("id", user.id).select("role").maybeSingle(),
            "Profile update retry",
          );
          if (retry.error) {
            setSaveError(profileSaveErrorMessage(retry.error.message, retry.error.code));
            return;
          }
          roleSaved = retry.data?.role ?? null;
        }
      }

      if (!roleSaved) {
        roleSaved = intent;
      }

      void refreshProfile({ silent: true });

      const merged: AuthAccountSnapshot = {
        role: (roleSaved as AuthRole) ?? intent,
        profileFields,
        hasGuardRow: intent === "guard" ? true : hasGuardRow,
        hasMerchantRow: intent === "merchant" ? true : hasMerchantRow,
      };

      const effectiveRole = merged.role ?? roleSaved ?? intent;
      if (effectiveRole !== intent) {
        setSaveError(
          profileSaveErrorMessage(
            `Role did not persist (expected ${intent}, got ${effectiveRole ?? "none"}).`,
          ),
        );
        return;
      }

      stabilLog("auth", "onboarding role save ok", { role: effectiveRole });
      if (tryLeaveOnboarding(merged, intent)) return;
      setStep(isProfileComplete(merged.profileFields ?? profileFields) ? "finish" : "profile");
    } catch (e) {
      const msg = e instanceof Error ? e.message : "Could not save your role.";
      console.error("[Onboarding] continueFromRole", e);
      setSaveError(profileSaveErrorMessage(msg));
    } finally {
      setSaving(false);
    }
  }

  async function saveProfile(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    if (!user?.id || saving) return;
    const fd = new FormData(e.currentTarget);
    const name = String(fd.get("full_name") ?? "").trim();
    const phoneRaw = String(fd.get("phone") ?? "").trim();
    if (name.length < 2) {
      setSaveError("Enter your display name (at least 2 characters).");
      return;
    }
    setSaving(true);
    setSaveError(null);
    try {
      let phoneVal: string | null = null;
      if (phoneRaw) {
        try {
          phoneVal = normalizeZaPhone(phoneRaw);
        } catch {
          setSaveError("Enter a valid South African mobile number or leave blank.");
          return;
        }
      }
      const { error } = await withSaveTimeout(
        supabase.from("profiles").update({ full_name: name, phone: phoneVal }).eq("id", user.id),
        "Profile save",
      );
      if (error) {
        setSaveError(profileSaveErrorMessage(error.message, error.code));
        if (import.meta.env.DEV) console.warn("[Onboarding] profile save", error);
        return;
      }
      void refreshProfile({ silent: true });
      const merged = {
        role: role ?? intent,
        profileFields: { full_name: name, phone: phoneVal },
        hasGuardRow,
        hasMerchantRow,
      } satisfies AuthAccountSnapshot;
      if (tryLeaveOnboarding(merged, intent)) return;
      setStep("finish");
    } catch (e) {
      const msg = e instanceof Error ? e.message : "Could not save your profile.";
      console.error("[Onboarding] saveProfile", e);
      setSaveError(profileSaveErrorMessage(msg));
    } finally {
      setSaving(false);
    }
  }

  function finishOnboarding() {
    const snap: AuthAccountSnapshot = {
      role: role ?? intent,
      profileFields,
      hasGuardRow,
      hasMerchantRow,
    };
    if (tryLeaveOnboarding(snap, intent)) return;
    navigate(destinationForSnapshot(snap, intent), { replace: true });
  }

  if (!sessionReady || !user) {
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

      {saveError && effectiveStep === "role" && (
        <div className="error fx-fade-up text-sm" role="alert">
          {saveError}
        </div>
      )}

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
                disabled={saving}
              />
              <span className="text-sm font-semibold text-white capitalize">{r}</span>
              <span className="ml-auto text-xs text-slate-500">
                {r === "customer" ? "Send tips" : r === "guard" ? "Receive tips" : "Manage a venue"}
              </span>
            </label>
          ))}
          <button
            type="button"
            className={`btn-gold tap-target w-full rounded-2xl py-3 font-black ${saving ? "btn-gold--loading" : ""}`}
            disabled={saving}
            aria-busy={saving}
            onClick={() => void continueFromRole()}
          >
            {saving ? (
              <span className="btn-gold-inner">
                <span className="btn-spinner" aria-hidden />
                Saving…
              </span>
            ) : (
              "Continue"
            )}
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
                disabled={saving}
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
                disabled={saving}
              />
            </label>
            {saveError && <div className="error text-sm" role="alert">{saveError}</div>}
            <button
              type="submit"
              className={`btn-gold tap-target w-full rounded-2xl py-3 font-black ${saving ? "btn-gold--loading" : ""}`}
              disabled={saving}
              aria-busy={saving}
            >
              {saving ? (
                <span className="btn-gold-inner">
                  <span className="btn-spinner" aria-hidden />
                  Saving…
                </span>
              ) : (
                "Save & continue"
              )}
            </button>
          </form>
          <button
            type="button"
            className="text-sm text-slate-500 underline"
            disabled={saving}
            onClick={() => {
              setSaveError(null);
              setStep("role");
            }}
          >
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
            <p className="fx-fade-up text-center text-sm text-emerald-400/90">Your account is ready.</p>
          )}
        </>
      )}

      <Link className="block text-center text-sm text-slate-500" to="/settings">
        Account settings
      </Link>
    </div>
  );
}
