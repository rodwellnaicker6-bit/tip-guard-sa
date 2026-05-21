import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { useAuth } from "../context/useAuth";
import PaystackTestBanner from "../components/PaystackTestBanner";

const THEME_KEY = "tipguard_theme";
const DARK_KEY = "tipguard_dark";

function applyDarkClass(on: boolean) {
  if (typeof document === "undefined") return;
  document.documentElement.classList.toggle("dark", on);
}

export default function Settings() {
  const { user, signOut } = useAuth();
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

  const meta = (user?.user_metadata as { full_name?: string }) ?? {};
  const name = typeof meta.full_name === "string" ? meta.full_name : "—";

  return (
    <div className="shell mx-auto max-w-md space-y-4 px-5 py-8 pb-24">
      <h2 className="text-xl font-black text-white">Account</h2>
      <PaystackTestBanner />

      <div className="card stack rounded-2xl border border-white/10 bg-white/5 p-4">
        <p className="text-xs font-semibold uppercase text-slate-500">Name (from signup)</p>
        <p className="text-lg font-bold text-white">{name}</p>
      </div>

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

      <div className="card stack rounded-2xl border border-white/10 bg-white/5 p-4">
        <strong className="text-white">Privacy &amp; data (South Africa)</strong>
        <p className="mt-2 text-sm leading-relaxed text-slate-400">
          TipGuard processes personal information to run payments and verification. For launch readiness, ensure your deployment has a
          current privacy notice and a process for access and deletion requests under POPIA.
        </p>
        <Link className="mt-3 inline-block text-sm font-bold text-amber-400" to="/privacy">
          Privacy policy
        </Link>
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
