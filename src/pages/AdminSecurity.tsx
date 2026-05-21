import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { supabase } from "../lib/supabase";
import { useAuth } from "../context/useAuth";

export default function AdminSecurity() {
  const { signOut } = useAuth();
  const [factors, setFactors] = useState<string>("");
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      const { data, error: mfaErr } = await supabase.auth.mfa.listFactors();
      if (cancelled) return;
      if (mfaErr) {
        setError(mfaErr.message);
        setFactors("");
        return;
      }
      const all = [...(data?.totp ?? []), ...(data?.phone ?? [])];
      setFactors(
        all.length ? all.map((f) => `${f.factor_type}: ${f.friendly_name ?? f.id}`).join(" · ") : "No MFA factors enrolled in this session.",
      );
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  return (
    <div className="shell mx-auto max-w-lg space-y-5 px-5 py-8 pb-24">
      <header>
        <p className="text-xs font-bold uppercase tracking-wider text-slate-500">Admin</p>
        <h1 className="text-2xl font-black text-white">Security</h1>
        <p className="mt-1 text-sm leading-relaxed text-slate-400">
          Production admin accounts should use multi-factor authentication (Supabase Auth TOTP or your IdP). This screen
          lists factors visible to the current session only.
        </p>
      </header>

      {error && <div className="rounded-xl border border-red-500/30 bg-red-500/10 px-3 py-2 text-sm text-red-200 break-words">{error}</div>}

      {!error && factors && (
        <div className="rounded-2xl border border-white/10 bg-white/[0.04] px-4 py-4">
          <p className="text-xs font-bold uppercase text-slate-500">Session factors</p>
          <p className="mt-2 break-words text-sm text-slate-300">{factors}</p>
        </div>
      )}

      <div className="flex flex-col gap-3 sm:flex-row">
        <button
          className="min-h-[48px] flex-1 rounded-2xl border border-white/10 py-3 text-sm font-semibold text-slate-200"
          type="button"
          onClick={() => void signOut()}
        >
          Sign out
        </button>
        <Link
          className="flex min-h-[48px] flex-1 items-center justify-center rounded-2xl bg-amber-500/15 py-3 text-center text-sm font-bold text-amber-200"
          to="/admin"
        >
          Back to dashboard
        </Link>
      </div>
    </div>
  );
}
