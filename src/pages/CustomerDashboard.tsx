import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { supabase } from "../lib/supabase";
import { useAuth } from "../context/useAuth";
import { GlassPanel } from "../components/fintech/GlassPanel";
import { TrustRibbon } from "../components/fintech/TrustRibbon";
import { getLoyaltySnapshot } from "../lib/loyalty";
import { zarFromCents } from "../lib/money";

export default function CustomerDashboard() {
  const { user, signOut } = useAuth();
  const email = user?.email ?? "your account";
  const [tipCount, setTipCount] = useState<number | null>(null);
  const [volume, setVolume] = useState<number | null>(null);
  const loyalty = getLoyaltySnapshot();

  useEffect(() => {
    if (import.meta.env.DEV && user?.id) {
      console.info(`[AuthDebug] CustomerDashboard mount user=${user.id}`);
    }
    if (!user?.id) return;
    let c = false;
    (async () => {
      const { data, error } = await supabase
        .from("tips")
        .select("amount_cents")
        .eq("payer_id", user.id)
        .eq("status", "succeeded");
      if (c || error || !data) return;
      setTipCount(data.length);
      setVolume(data.reduce((s, r) => s + (r.amount_cents as number), 0));
    })();
    return () => {
      c = true;
    };
  }, [user?.id]);

  return (
    <div className="shell mx-auto max-w-lg space-y-5 px-5 py-8 pb-16">
      <header className="fx-fade-up">
        <p className="text-xs font-bold uppercase tracking-wider text-slate-500">Wallet hub</p>
        <h1 className="fx-gradient-text text-3xl font-black tracking-tight">Your dashboard</h1>
        <p className="mt-1 text-sm text-slate-400">
          Signed in as <span className="font-semibold text-slate-200">{email}</span>
        </p>
      </header>

      <TrustRibbon />

      <div className="grid grid-cols-2 gap-3">
        <GlassPanel glow="amber" className="fx-fade-up">
          <p className="text-[10px] font-bold uppercase tracking-wider text-slate-500">Tips sent</p>
          <p className="mt-1 text-2xl font-black text-white">{tipCount ?? "—"}</p>
        </GlassPanel>
        <GlassPanel glow="emerald" className="fx-fade-up">
          <p className="text-[10px] font-bold uppercase tracking-wider text-slate-500">Lifetime volume</p>
          <p className="mt-1 text-xl font-black text-amber-400">{volume != null ? zarFromCents(volume) : "—"}</p>
        </GlassPanel>
      </div>

      <GlassPanel className="fx-fade-up" glow="slate">
        <p className="text-xs font-bold uppercase text-slate-500">Loyalty (device)</p>
        <p className="mt-1 text-sm text-slate-300">
          Streak <strong className="text-amber-400">{loyalty.streak}</strong> · Points{" "}
          <strong className="text-amber-400">{loyalty.points}</strong>
        </p>
        <p className="mt-2 text-xs text-slate-500">Server-backed rewards &amp; referrals ship next — this preview builds habit.</p>
      </GlassPanel>

      <GlassPanel className="fx-fade-up border-dashed border-amber-500/25" glow="amber">
        <p className="text-xs font-bold uppercase text-amber-200/80">Referrals</p>
        <p className="mt-1 text-sm text-slate-400">Invite friends after we wire unique referral codes to your profile.</p>
      </GlassPanel>

      <Link
        className="block w-full rounded-2xl bg-gradient-to-r from-amber-400 to-amber-600 py-4 text-center text-sm font-black text-black shadow-lg shadow-amber-500/25"
        to="/customer"
      >
        Browse verified guards
      </Link>

      <div className="grid grid-cols-2 gap-2 text-center text-sm font-semibold">
        <Link className="rounded-xl border border-white/10 py-3 text-amber-400" to="/customer/history">
          Tip history
        </Link>
        <Link className="rounded-xl border border-white/10 py-3 text-amber-400" to="/customer/wallet">
          Wallet
        </Link>
        <Link className="rounded-xl border border-white/10 py-3 text-amber-400" to="/customer/transactions">
          Ledger
        </Link>
        <Link className="rounded-xl border border-white/10 py-3 text-slate-300" to="/settings">
          Settings
        </Link>
      </div>

      <button className="w-full rounded-2xl border border-white/10 py-3 text-sm font-semibold text-slate-400" type="button" onClick={() => void signOut()}>
        Sign out
      </button>
      <Link className="block text-center text-sm text-slate-500" to="/">
        Home
      </Link>
    </div>
  );
}
