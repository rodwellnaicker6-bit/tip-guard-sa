import { useEffect, useState, type FormEvent } from "react";
import { Link } from "react-router-dom";
import { useAuth } from "../context/useAuth";
import PaystackTestBanner from "../components/PaystackTestBanner";
import { DEFAULT_ADMIN_MFA_SETTINGS } from "../lib/mfaTypes";
import { supabase } from "../lib/supabase";
import { normalizeZaPhone } from "../lib/normalizeZaPhone";
import { profileCompletionPercent, profileChecklist } from "../lib/profileCompletion";

const THEME_KEY = "tipguard_theme";
const DARK_KEY = "tipguard_dark";

function applyDarkClass(on: boolean) {
  if (typeof document === "undefined") return;
  document.documentElement.classList.toggle("dark", on);
}

export default function Settings() {
  const { user, role, profileFields, refreshProfile, signOut } = useAuth();
  const mfa = DEFAULT_ADMIN_MFA_SETTINGS;
  const [profileError, setProfileError] = useState<string | null>(null);
  const [profileSaved, setProfileSaved] = useState(false);
  const [profileBusy, setProfileBusy] = useState(false);
  const profileFormKey = `${user?.id ?? ""}-${profileFields.full_name ?? ""}-${profileFields.phone ?? ""}`;
  const [highContrast, setHighContrast] = useState(
    () => typeof document !== "undefined" && document.documentElement.dataset.theme === "hc",
  );
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
    setProfileBusy(true);
    setProfileError(null);
    setProfileSaved(false);
    let phoneVal: string | null = null;
    if (phoneRaw) {
      try {
        phoneVal = normalizeZaPhone(phoneRaw);
      } catch {
        setProfileError("Enter a valid South African mobile number or leave blank.");
        setProfileBusy(false);
        return;
      }
    }
    const { error } = await supabase
      .from("profiles")
      .update({ full_name: name, phone: phoneVal })
      .eq("id", user.id);
    setProfileBusy(false);
    if (error) {
      setProfileError(error.message);
      return;
    }
    await refreshProfile();
    setProfileSaved(true);
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
