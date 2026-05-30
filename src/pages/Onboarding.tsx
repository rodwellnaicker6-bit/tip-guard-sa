import { useCallback, useEffect, useMemo, useRef, useState, type FormEvent } from "react";
import { useGracePeriod } from "../hooks/useGracePeriod";
import { Link, useLocation, useNavigate } from "react-router-dom";
import { useAuth } from "../context/useAuth";
import type { AuthAccountSnapshot, AuthRole, AuthProfileFields } from "../context/authTypes";
import { GlassPanel } from "../components/fintech/GlassPanel";
import PaystackTestBanner from "../components/PaystackTestBanner";
import { Skeleton } from "../components/Skeleton";
import { SlowLoadHint } from "../components/SlowLoadHint";
import { useUiWatchdog } from "../lib/uiWatchdog";
import { supabase } from "../lib/supabase";
import { pathAfterSignIn } from "../lib/postAuthRedirect";
import { isProfileComplete, profileCompletionPercent } from "../lib/profileCompletion";
import { normalizeZaPhone } from "../lib/normalizeZaPhone";
import { unwrapRpcSingle } from "../lib/rpcData";
import { logOnboarding, ONBOARDING_FAILSAFE_MS, withOnboardingTimeout } from "../lib/onboardingDebug";
import { recordError } from "../lib/errorTelemetry";
import { isComplianceDemoMode } from "../lib/complianceDemo";
import { onboardingErrorMessage } from "../lib/userFacingErrors";

type LocationState = { registeredRole?: "customer" | "guard" | "merchant" };
type IntentRole = "customer" | "guard" | "merchant";

const STEPS = ["role", "profile", "finish"] as const;
type Step = (typeof STEPS)[number];

const CONTINUE_DEBOUNCE_MS = 800;
const PROFILE_REFRESH_TIMEOUT_MS = 4_000;
const SESSION_RESTORE_GRACE_MS = 3_500;

function merchantHubDest(hasMerchantRow: boolean): string {
  return hasMerchantRow ? "/merchant" : "/merchant/setup";
}

export default function Onboarding() {
  const { user, session, authReady, sessionReady, role, effectiveRole, pendingRole, setPendingRole, profileFields, hasGuardRow, hasMerchantRow, refreshProfile } =
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
  const [localProfileFields, setLocalProfileFields] = useState<AuthProfileFields | null>(null);
  const [localRole, setLocalRole] = useState<AuthRole | null>(null);

  const sessionUserId = user?.id ?? session?.user?.id;
  const displayUser = user ?? session?.user ?? null;
  const sessionMissing = sessionReady && authReady && !sessionUserId;
  const sessionGraceElapsed = useGracePeriod(sessionMissing, SESSION_RESTORE_GRACE_MS);
  const bootLoading = !sessionReady || !authReady || (!sessionUserId && !sessionGraceElapsed);
  const slowLoad = useUiWatchdog(bootLoading);

  const savingRef = useRef(false);
  const lastContinueAtRef = useRef(0);
  const failSafeTimerRef = useRef<number | null>(null);
  const rolePersistedRef = useRef(false);

  const activeProfileFields = localProfileFields ?? profileFields;
  const activeRole = localRole ?? effectiveRole ?? role;

  const setSavingSafe = useCallback((next: boolean) => {
    savingRef.current = next;
    setSaving(next);
  }, []);

  const clearFailSafe = useCallback(() => {
    if (failSafeTimerRef.current) {
      window.clearTimeout(failSafeTimerRef.current);
      failSafeTimerRef.current = null;
    }
  }, []);

  const scheduleBackgroundProfileSync = useCallback(() => {
    logOnboarding("refreshProfile background schedule");
    void withOnboardingTimeout(
      "refreshProfile",
      refreshProfile({ silent: true, source: "onboarding" }),
      PROFILE_REFRESH_TIMEOUT_MS,
    ).catch((e) => {
      logOnboarding("refreshProfile background failed (non-blocking)", {
        message: e instanceof Error ? e.message : String(e),
      });
    });
  }, [refreshProfile]);

  const armFailSafe = useCallback(
    (chosenIntent: IntentRole) => {
      clearFailSafe();
      failSafeTimerRef.current = window.setTimeout(() => {
        if (!savingRef.current || !rolePersistedRef.current) return;
        logOnboarding("fail-safe: role saved but UI still saving — forcing exit", { intent: chosenIntent });
        setSavingSafe(false);
        if (chosenIntent === "merchant") {
          logOnboarding("navigate fail-safe", { dest: merchantHubDest(false) });
          navigate(merchantHubDest(false), { replace: true });
          scheduleBackgroundProfileSync();
          return;
        }
        if (chosenIntent === "guard") {
          navigate("/guard/setup", { replace: true });
          scheduleBackgroundProfileSync();
          return;
        }
        setStep(isProfileComplete(activeProfileFields) ? "finish" : "profile");
        scheduleBackgroundProfileSync();
      }, ONBOARDING_FAILSAFE_MS);
    },
    [activeProfileFields, clearFailSafe, navigate, scheduleBackgroundProfileSync, setSavingSafe],
  );

  useEffect(() => {
    savingRef.current = saving;
  }, [saving]);

  useEffect(() => {
    logOnboarding("session snapshot", {
      sessionReady,
      authReady,
      uid: sessionUserId ?? null,
      step,
      intent,
      activeRole,
      pendingRole,
      profileReadyFields: isProfileComplete(activeProfileFields),
    });
  }, [sessionReady, authReady, sessionUserId, step, intent, activeRole, pendingRole, activeProfileFields]);

  useEffect(() => () => clearFailSafe(), [clearFailSafe]);

  const effectiveStep: Step =
    step === "finish" && !isProfileComplete(activeProfileFields) ? "profile" : step;

  const profileDone = isProfileComplete(activeProfileFields);
  const profilePct = profileCompletionPercent(activeProfileFields);
  const roleDone =
    intent === "merchant"
      ? hasMerchantRow || activeRole === "merchant"
      : intent === "guard"
        ? hasGuardRow || activeRole === "guard"
        : true;
  const allDone = profileDone && roleDone;

  function buildSnapshot(
    overrides: Partial<AuthAccountSnapshot> & { role?: AuthRole },
  ): AuthAccountSnapshot {
    return {
      role: overrides.role ?? activeRole ?? intent,
      profileFields: overrides.profileFields ?? activeProfileFields,
      hasGuardRow: overrides.hasGuardRow ?? (intent === "guard" ? true : hasGuardRow),
      hasMerchantRow: overrides.hasMerchantRow ?? (intent === "merchant" ? true : hasMerchantRow),
    };
  }

  function destinationForSnapshot(snap: AuthAccountSnapshot, chosenRole: IntentRole): string {
    const effectiveRole = snap.role ?? chosenRole;
    return pathAfterSignIn(effectiveRole, snap.hasGuardRow, snap.hasMerchantRow, snap.profileFields);
  }

  function tryLeaveOnboarding(snap: AuthAccountSnapshot, chosenRole: IntentRole): boolean {
    let dest = destinationForSnapshot(snap, chosenRole);
    if (dest === "/onboarding" && chosenRole === "merchant" && isProfileComplete(snap.profileFields)) {
      dest = merchantHubDest(snap.hasMerchantRow);
    }
    logOnboarding("tryLeaveOnboarding", { dest, chosenRole, role: snap.role });
    if (dest === "/onboarding") return false;
    logOnboarding("navigate", { dest, replace: true });
    navigate(dest, { replace: true });
    return true;
  }

  function advanceAfterRoleSave(merged: AuthAccountSnapshot) {
    const nextStep: Step = isProfileComplete(merged.profileFields) ? "finish" : "profile";
    logOnboarding("step change", { from: step, to: nextStep });
    setStep(nextStep);
  }

  async function continueFromRole() {
    const now = Date.now();
    const uid = sessionUserId;
    if (!uid || savingRef.current) return;
    if (now - lastContinueAtRef.current < CONTINUE_DEBOUNCE_MS) {
      logOnboarding("continueFromRole debounced");
      return;
    }
    lastContinueAtRef.current = now;
    if (!sessionReady || !authReady) {
      setSaveError("Still connecting your session. Wait a moment and try again.");
      return;
    }

    rolePersistedRef.current = false;
    setSavingSafe(true);
    setSaveError(null);
    setPendingRole(intent);
    setLocalRole(intent);
    armFailSafe(intent);

    try {
      logOnboarding("continueFromRole", { intent, uid });

      const { data: savedRoleRaw, error: rpcErr } = await withOnboardingTimeout(
        "rpc save_onboarding_role",
        supabase.rpc("save_onboarding_role", { p_role: intent }),
      );

      let roleSaved = unwrapRpcSingle<string>(savedRoleRaw);

      if (rpcErr) {
        if (import.meta.env.DEV) console.error("[Onboarding] save_onboarding_role", rpcErr.message, rpcErr.code);
        const { data: row, error: updErr } = await withOnboardingTimeout(
          "profiles update role",
          supabase.from("profiles").update({ role: intent }).eq("id", uid).select("role").maybeSingle(),
        );
        if (updErr) {
          setSaveError(onboardingErrorMessage(updErr.message, updErr.code));
          if (import.meta.env.DEV) console.warn("[Onboarding] role save", rpcErr, updErr);
          return;
        }
        roleSaved = row?.role ?? null;
        if (!roleSaved) {
          const { error: insErr } = await withOnboardingTimeout(
            "profiles insert",
            supabase.from("profiles").insert({
              id: uid,
              role: "customer",
              full_name:
                activeProfileFields.full_name ??
                (typeof displayUser?.user_metadata?.full_name === "string"
                  ? displayUser.user_metadata.full_name
                  : null) ??
                "Member",
            }),
          );
          if (insErr) {
            setSaveError(onboardingErrorMessage(insErr.message, insErr.code));
            return;
          }
          const retry = await withOnboardingTimeout(
            "profiles update role retry",
            supabase.from("profiles").update({ role: intent }).eq("id", uid).select("role").maybeSingle(),
          );
          if (retry.error) {
            setSaveError(onboardingErrorMessage(retry.error.message, retry.error.code));
            return;
          }
          roleSaved = retry.data?.role ?? null;
        }
      }

      if (!roleSaved) roleSaved = intent;

      const persistedRole = (roleSaved as AuthRole) ?? intent;
      if (persistedRole !== intent) {
        setSaveError(onboardingErrorMessage(`Role did not persist (expected ${intent}, got ${persistedRole ?? "none"}).`));
        return;
      }

      rolePersistedRef.current = true;
      setLocalRole(persistedRole);
      scheduleBackgroundProfileSync();

      const merged = buildSnapshot({ role: persistedRole });
      logOnboarding("role save ok", { role: persistedRole });

      if (tryLeaveOnboarding(merged, intent)) return;
      advanceAfterRoleSave(merged);
    } catch (e) {
      const msg = e instanceof Error ? e.message : "Could not save your role.";
      console.error("[Onboarding] continueFromRole", e);
      recordError("onboarding_role", msg, { code: "save_failed" });
      setSaveError(onboardingErrorMessage(msg));
    } finally {
      clearFailSafe();
      setSavingSafe(false);
      logOnboarding("continueFromRole finally", { saving: false });
    }
  }

  async function saveProfile(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    if (!sessionUserId || savingRef.current) return;

    const fd = new FormData(e.currentTarget);
    const name = String(fd.get("full_name") ?? "").trim();
    const phoneRaw = String(fd.get("phone") ?? "").trim();
    if (name.length < 2) {
      setSaveError("Enter your display name (at least 2 characters).");
      return;
    }

    let phoneVal: string | null = null;
    if (phoneRaw) {
      try {
        phoneVal = normalizeZaPhone(phoneRaw);
      } catch {
        setSaveError("Enter a valid South African mobile number or leave blank.");
        return;
      }
    }

    setSavingSafe(true);
    setSaveError(null);

    try {
      const { error } = await withOnboardingTimeout(
        "profiles update",
        supabase.from("profiles").update({ full_name: name, phone: phoneVal }).eq("id", sessionUserId),
      );
      if (error) {
        setSaveError(onboardingErrorMessage(error.message, error.code));
        if (import.meta.env.DEV) console.warn("[Onboarding] profile save", error);
        return;
      }

      const nextFields: AuthProfileFields = { full_name: name, phone: phoneVal };
      setLocalProfileFields(nextFields);
      scheduleBackgroundProfileSync();

      const merged = buildSnapshot({ profileFields: nextFields });
      logOnboarding("profile save ok");
      if (tryLeaveOnboarding(merged, intent)) return;
      logOnboarding("step change", { from: step, to: "finish" });
      setStep("finish");
    } catch (err) {
      const msg = err instanceof Error ? err.message : "Could not save your profile.";
      console.error("[Onboarding] saveProfile", err);
      setSaveError(onboardingErrorMessage(msg));
    } finally {
      setSavingSafe(false);
      logOnboarding("saveProfile finally", { saving: false });
    }
  }

  function finishOnboarding() {
    const snap = buildSnapshot({});
    logOnboarding("finishOnboarding", { intent, allDone, roleDone, profileDone });
    if (tryLeaveOnboarding(snap, intent)) {
      scheduleBackgroundProfileSync();
      return;
    }
    if (intent === "merchant") {
      const dest = merchantHubDest(hasMerchantRow);
      logOnboarding("navigate merchant fail-safe", { dest });
      navigate(dest, { replace: true });
      scheduleBackgroundProfileSync();
      return;
    }
    const dest = destinationForSnapshot(snap, intent);
    logOnboarding("navigate", { dest });
    navigate(dest, { replace: true });
    scheduleBackgroundProfileSync();
  }

  if (!sessionReady || !authReady || !sessionUserId) {
    if (sessionReady && authReady && sessionGraceElapsed) {
      return (
        <div className="shell mx-auto max-w-lg space-y-4 px-5 py-10 pb-20 text-center">
          <h2 className="text-xl font-bold text-white">Session expired</h2>
          <p className="text-sm text-slate-400">Sign in again to continue onboarding.</p>
          <Link className="btn-gold tap-target inline-block rounded-2xl px-6 py-3 font-black no-underline" to="/login" state={{ from: "/onboarding" }}>
            Sign in
          </Link>
        </div>
      );
    }
    return (
      <div className="shell mx-auto max-w-lg space-y-4 px-5 py-10 pb-20" role="status" aria-live="polite">
        <Skeleton style={{ height: 12, width: "35%", margin: "0 auto" }} />
        <Skeleton style={{ height: 32, width: "70%", margin: "12px auto 0" }} />
        <Skeleton style={{ height: 14, width: "55%", margin: "8px auto 0" }} />
        <div className="flex justify-center gap-2 pt-4">
          <Skeleton style={{ height: 6, width: 40, borderRadius: 999 }} />
          <Skeleton style={{ height: 6, width: 40, borderRadius: 999 }} />
          <Skeleton style={{ height: 6, width: 40, borderRadius: 999 }} />
        </div>
        <Skeleton style={{ height: 220, width: "100%", borderRadius: 20, marginTop: 16 }} />
        <p className="text-center text-sm text-slate-500">
          {!sessionReady || !authReady ? "Loading your account…" : "Restoring your session…"}
        </p>
        <SlowLoadHint show={slowLoad} message="Connection is slow — still working…" />
      </div>
    );
  }

  const stepIndex = STEPS.indexOf(effectiveStep) + 1;

  return (
    <div className="shell mx-auto max-w-lg space-y-4 px-5 py-8 pb-20">
      {!isComplianceDemoMode() ? <PaystackTestBanner /> : null}
      <header className="fx-fade-up text-center">
        <p className="muted-label">
          Step {stepIndex} of {STEPS.length}
        </p>
        <h2 className="fx-gradient-text text-2xl font-black">Welcome to TipGuard</h2>
        <p className="mt-2 text-sm text-slate-400">
          {displayUser?.email ? (
            <>
              Signed in as <span className="font-semibold text-slate-200">{displayUser.email}</span>
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
        <div className="error fx-fade-up space-y-3 text-sm" role="alert">
          <p>{saveError}</p>
          <button
            type="button"
            className="btn-ghost tap-target w-full rounded-xl border border-white/15 py-2 font-semibold"
            disabled={saving}
            onClick={() => void continueFromRole()}
          >
            Retry saving role
          </button>
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
            key={`${sessionUserId}-${activeProfileFields.full_name ?? ""}-${activeProfileFields.phone ?? ""}`}
            className="space-y-3"
            onSubmit={(e) => void saveProfile(e)}
          >
            <label className="block">
              <span className="text-xs text-slate-500">Display name</span>
              <input
                className="field tap-target mt-1 w-full"
                name="full_name"
                defaultValue={activeProfileFields.full_name ?? ""}
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
                defaultValue={activeProfileFields.phone ?? ""}
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
              logOnboarding("step change", { from: step, to: "role" });
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

          <button
            type="button"
            className="btn-gold tap-target fx-fade-up w-full rounded-2xl py-4 font-black"
            onClick={finishOnboarding}
          >
            {allDone ? "Go to dashboard" : "Continue to app"}
          </button>

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
