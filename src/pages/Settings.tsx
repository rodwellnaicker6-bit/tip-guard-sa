import { useEffect, useState, type FormEvent } from "react";
import { Link } from "react-router-dom";
import { useAuth } from "../context/useAuth";
import PaystackTestBanner from "../components/PaystackTestBanner";
import { DEFAULT_ADMIN_MFA_SETTINGS } from "../lib/mfaTypes";
import { supabase } from "../lib/supabase";
import { normalizeZaPhone } from "../lib/normalizeZaPhone";
import { profileCompletionPercent, profileChecklist } from "../lib/profileCompletion";
import { PayoutSchedulePanel } from "../components/PayoutSchedulePanel";
import { fetchEntityPayoutPrefs, type PayoutSchedule } from "../lib/payoutSchedule";
import { withTimeout } from "../lib/asyncTimeout";

const THEME_KEY = "tipguard_theme";
const DARK_KEY = "tipguard_dark";
const PROFILE_SAVE_TIMEOUT_MS = 10_000;
const PROFILE_REFRESH_TIMEOUT_MS = 10_000;
const PAYOUT_PREFS_TIMEOUT_MS = 10_000;

function logAccountRequest(label: string, detail: Record<string, unknown>) {
  console.info(`[TipGuard:account] ${label}`, detail);
}

function applyDarkClass(on: boolean) {
  if (typeof document === "undefined") return;
  document.documentElement.classList.toggle("dark", on);
}

type PayoutEntity = {
  table: "guards" | "merchants";
  id: string;
  schedule: PayoutSchedule;
  nextPayoutAt: string | null;
  minCents: number;
  availableCents?: number;
  pendingCents?: number;
  schemaComplete: boolean;
};

export default function Settings() {
  const { user, role, profileFields, refreshProfile, signOut, isGuardUser, isMerchantUser } = useAuth();
  const mfa = DEFAULT_ADMIN_MFA_SETTINGS;
  const [profileError, setProfileError] = useState<string | null>(null);
  const [profileSaved, setProfileSaved] = useState(false);
  const [profileBusy, setProfileBusy] = useState(false);
  const profileFormKey = `${user?.id ?? ""}-${profileFields.full_name ?? ""}-${profileFields.phone ?? ""}`;
  const [highContrast, setHighContrast] = useState(
    () => typeof document !== "undefined" && document.documentElement.dataset.theme === "hc",
  );
  const [payoutEntity, setPayoutEntity] = useState<PayoutEntity | null>(null);
  const [payoutSchemaComplete, setPayoutSchemaComplete] = useState(true);

  useEffect(() => {
    if (!user?.id) return;
    let cancelled = false;
    (async () => {
      try {
        if (isGuardUser) {
          logAccountRequest("payout prefs request", { table: "guards", userId: user.id });
          const { prefs } = await withTimeout(
            fetchEntityPayoutPrefs("guards", user.id),
            PAYOUT_PREFS_TIMEOUT_MS,
            "Payout preferences timed out",
          );
          logAccountRequest("payout prefs response", {
            table: "guards",
            hasPrefs: Boolean(prefs),
            schemaComplete: prefs?.schemaComplete ?? null,
          });
          if (cancelled || !prefs) return;
          let avail: number | undefined;
          let pending: number | undefined;
          const walletStartedAt = performance.now();
          logAccountRequest("wallet payout request", { guardId: prefs.id });
          const { data: w, error: walletErr } = await withTimeout(
            supabase
              .from("wallet_accounts")
              .select("available_cents, pending_cents")
              .eq("guard_id", prefs.id)
              .maybeSingle(),
            PAYOUT_PREFS_TIMEOUT_MS,
            "Wallet payout balance timed out",
          );
          logAccountRequest("wallet payout response", {
            guardId: prefs.id,
            ms: Math.round(performance.now() - walletStartedAt),
            ok: !walletErr,
            error: walletErr?.message ?? null,
            hasRow: Boolean(w),
          });
          if (w) {
            avail = w.available_cents as number;
            pending = w.pending_cents as number;
          }
          setPayoutSchemaComplete(prefs.schemaComplete);
          setPayoutEntity({
            table: "guards",
            id: prefs.id,
            schedule: prefs.schedule,
            nextPayoutAt: prefs.nextPayoutAt,
            minCents: prefs.minCents,
            availableCents: avail,
            pendingCents: pending,
            schemaComplete: prefs.schemaComplete,
          });
          return;
        }
        if (isMerchantUser) {
          logAccountRequest("payout prefs request", { table: "merchants", userId: user.id });
          const { prefs } = await withTimeout(
            fetchEntityPayoutPrefs("merchants", user.id),
            PAYOUT_PREFS_TIMEOUT_MS,
            "Payout preferences timed out",
          );
          logAccountRequest("payout prefs response", {
            table: "merchants",
            hasPrefs: Boolean(prefs),
            schemaComplete: prefs?.schemaComplete ?? null,
          });
          if (cancelled || !prefs) return;
          setPayoutSchemaComplete(prefs.schemaComplete);
          setPayoutEntity({
            table: "merchants",
            id: prefs.id,
            schedule: prefs.schedule,
            nextPayoutAt: prefs.nextPayoutAt,
            minCents: prefs.minCents,
            schemaComplete: prefs.schemaComplete,
          });
          return;
        }
        if (!cancelled) {
          setPayoutEntity(null);
          setPayoutSchemaComplete(true);
        }
      } catch (e) {
        const message = e instanceof Error ? e.message : String(e);
        logAccountRequest("payout prefs failed", { userId: user.id, error: message });
        if (!cancelled) {
          setPayoutEntity(null);
          setPayoutSchemaComplete(false);
        }
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [user?.id, isGuardUser, isMerchantUser]);

  const [darkUi, setDarkUi] = useState(() => {
    if (typeof localStorage === "undefined") return true;
    const v = localStorage.getItem(DARK_KEY);
    if (v === "0") return false;
    return true;
  });

  useEffect(() => {
    applyDarkClass(darkUi);
  }, [darkUi]);

  function toggleTheme() {
    const next = !highContrast;
    setHighContrast(next);
    if (next) {
      document.documentElement.dataset.theme = "hc";
      localStorage.setItem(THEME_KEY, "hc");
    } else {
      delete document.documentElement.dataset.theme;
      localStorage.removeItem(THEME_KEY);
    }
  }

  function toggleDark() {
    const next = !darkUi;
    setDarkUi(next);
    localStorage.setItem(DARK_KEY, next ? "1" : "0");
    applyDarkClass(next);
  }

  async function saveProfile(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    if (!user?.id) return;
    const fd = new FormData(e.currentTarget);
    const name = String(fd.get("full_name") ?? "").trim();
    const phoneRaw = String(fd.get("phone") ?? "").trim();
    if (name.length < 2) {
      setProfileError("Display name must be at least 2 characters.");
      return;
    }
    let phoneVal: string | null = null;
    if (phoneRaw) {
      try {
        phoneVal = normalizeZaPhone(phoneRaw);
      } catch {
        setProfileError("Enter a valid South African mobile number or leave blank.");
        return;
      }
    }
    setProfileBusy(true);
    setProfileError(null);
    setProfileSaved(false);
    const payload = { full_name: name, phone: phoneVal };
    const saveStartedAt = performance.now();
    logAccountRequest("profile save request", { userId: user.id, payload });
    try {
      const { error } = await withTimeout(
        supabase
          .from("profiles")
          .update(payload)
          .eq("id", user.id),
        PROFILE_SAVE_TIMEOUT_MS,
        "Profile save timed out",
      );
      logAccountRequest("profile save response", {
        userId: user.id,
        ms: Math.round(performance.now() - saveStartedAt),
        ok: !error,
        error: error?.message ?? null,
      });
      if (error) {
        setProfileError(error.message);
        return;
      }
      const refreshStartedAt = performance.now();
      logAccountRequest("profile refresh request", { userId: user.id });
      await withTimeout(
        refreshProfile(),
        PROFILE_REFRESH_TIMEOUT_MS,
        "Profile refresh timed out",
      );
      logAccountRequest("profile refresh response", {
        userId: user.id,
        ms: Math.round(performance.now() - refreshStartedAt),
        ok: true,
      });
      setProfileSaved(true);
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      console.error("[TipGuard:account] profile save failed", err);
      logAccountRequest("profile save failed", {
        userId: user.id,
        ms: Math.round(performance.now() - saveStartedAt),
        error: message,
      });
      setProfileError(message);
    } finally {
      setProfileBusy(false);
    }
  }

  const pct = profileCompletionPercent(profileFields);
  const checklist = profileChecklist(profileFields);

  return (
    <div className="shell mx-auto max-w-md space-y-4 px-5 py-8 pb-24">
      <h2 className="text-xl font-black text-white">Account</h2>
      <PaystackTestBanner />

      <form
        key={profileFormKey}
        className="card stack rounded-2xl border border-white/10 bg-white/5 p-4"
        onSubmit={(e) => void saveProfile(e)}
      >
        <strong className="text-white">Profile · {pct}%</strong>
        <label className="mt-3 block">
          <span className="text-xs font-semibold uppercase text-slate-500">Display name</span>
          <input
            className="field tap-target mt-1 w-full"
            name="full_name"
            defaultValue={profileFields.full_name ?? ""}
            autoComplete="name"
            required
            minLength={2}
          />
        </label>
        <label className="mt-3 block">
          <span className="text-xs font-semibold uppercase text-slate-500">Mobile (optional)</span>
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
        <ul className="mt-2 space-y-1 text-xs text-slate-500">
          {checklist.map((item) => (
            <li key={item.id}>
              {item.done ? "✓" : "○"} {item.label}
            </li>
          ))}
        </ul>
        {profileError && <div className="error mt-2 text-sm">{profileError}</div>}
        {profileSaved && <p className="mt-2 text-sm text-emerald-400">Profile saved.</p>}
        <button type="submit" className="btn-gold tap-target mt-3 w-full rounded-2xl py-3 font-bold" disabled={profileBusy}>
          {profileBusy ? "Saving…" : "Save profile"}
        </button>
      </form>

      {user && payoutEntity && (
        <div className="card stack rounded-2xl border-2 border-amber-500/30 bg-amber-500/5 p-4">
          <PayoutSchedulePanel
            table={payoutEntity.table}
            entityId={payoutEntity.id}
            schedule={payoutEntity.schedule}
            nextPayoutAt={payoutEntity.nextPayoutAt}
            minimumPayoutThresholdCents={payoutEntity.minCents}
            availableCents={payoutEntity.availableCents}
            pendingCents={payoutEntity.pendingCents}
            prominent
            schemaUnavailable={!payoutSchemaComplete}
          />
          <p className="mt-2 text-xs text-slate-500">
            Also on{" "}
            <Link className="font-semibold text-amber-400" to="/guard#payout-preferences">
              guard dashboard
            </Link>{" "}
            or{" "}
            <Link className="font-semibold text-amber-400" to="/merchant#payout-preferences">
              venue hub
            </Link>
            .
          </p>
        </div>
      )}

      <div className="card stack rounded-2xl border border-white/10 bg-white/5 p-4">
        <p className="text-xs font-semibold uppercase text-slate-500">Email</p>
        <p className="text-base text-slate-200">{user?.email ?? "—"}</p>
      </div>

      <div className="card stack rounded-2xl border border-white/10 bg-white/5 p-4">
        <strong className="text-white">Display</strong>
        <label className="mt-3 flex cursor-pointer items-center justify-between gap-3 rounded-xl border border-white/10 bg-black/20 px-3 py-3">
          <span className="text-sm text-slate-300">Dark UI (Tailwind)</span>
          <input type="checkbox" checked={darkUi} onChange={toggleDark} />
        </label>
        <p className="mt-1 text-xs text-slate-500">Premium fintech surfaces use the dark palette by default.</p>
        <label className="mt-2 flex cursor-pointer items-center justify-between gap-3 rounded-xl border border-white/10 bg-black/20 px-3 py-3">
          <span className="text-sm text-slate-300">High-contrast</span>
          <input type="checkbox" checked={highContrast} onChange={toggleTheme} />
        </label>
        <p className="mt-1 text-xs text-slate-500">Stronger borders and text contrast.</p>
      </div>

      {role === "admin" && (
        <div className="card stack rounded-2xl border border-amber-500/25 bg-amber-500/5 p-4">
          <strong className="text-white">Admin security (MFA)</strong>
          <p className="mt-2 text-sm leading-relaxed text-slate-400">
            Multi-factor authentication for admin accounts is recommended before production. Full TOTP enrollment via
            Supabase Auth is post-MVP; use the security dashboard to inspect session factors.
          </p>
          <p className="text-xs text-slate-500">
            Require TOTP: {mfa.requireTotpForAdmin ? "yes" : "no (scaffold)"} · Factors: {mfa.factors.length}
          </p>
          <Link className="mt-3 inline-block text-sm font-bold text-amber-400" to="/admin/security">
            Open admin security
          </Link>
        </div>
      )}

      <div className="card stack rounded-2xl border border-white/10 bg-white/5 p-4">
        <strong className="text-white">Privacy &amp; data (South Africa)</strong>
        <p className="mt-2 text-sm leading-relaxed text-slate-400">
          TipGuard processes personal information to run payments and verification. For launch readiness, ensure your deployment has a
          current privacy notice and a process for access and deletion requests under POPIA.
        </p>
        <div className="mt-3 flex flex-wrap gap-3 text-sm">
          <Link className="font-bold text-amber-400" to="/privacy">
            Privacy
          </Link>
          <Link className="font-bold text-amber-400" to="/legal/popia">
            POPIA
          </Link>
          <Link className="font-bold text-amber-400" to="/terms">
            Terms
          </Link>
        </div>
      </div>

      <button className="btn-ghost w-full rounded-2xl border border-white/15 py-3 font-semibold" type="button" onClick={() => void signOut()}>
        Sign out
      </button>

      <div className="flex flex-wrap gap-3 text-sm">
        <Link className="text-amber-400" to="/onboarding">
          Setup checklist
        </Link>
        <Link className="text-amber-400" to="/">
          Home
        </Link>
      </div>
    </div>
  );
}
