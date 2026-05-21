import { useEffect } from "react";
import { Link, useLocation, useNavigate } from "react-router-dom";
import { useAuth } from "../context/useAuth";
import { GlassPanel } from "../components/fintech/GlassPanel";
import PaystackTestBanner from "../components/PaystackTestBanner";

type LocationState = { registeredRole?: "customer" | "guard" | "merchant" };

export default function Onboarding() {
  const { user, role, hasGuardRow, hasMerchantRow, loading } = useAuth();
  const navigate = useNavigate();
  const location = useLocation();
  const reg = (location.state as LocationState | null)?.registeredRole;

  useEffect(() => {
    if (loading) return;
    if (!user) {
      navigate("/login", { replace: true, state: { from: "/onboarding" } });
    }
  }, [loading, user, navigate]);

  if (loading || !user) {
    return (
      <div className="shell mx-auto max-w-lg px-5 py-10">
        <p className="text-slate-400">Loading your account…</p>
      </div>
    );
  }

  const meta = (user.user_metadata as { full_name?: string; role?: string }) ?? {};
  const displayName = typeof meta.full_name === "string" && meta.full_name.trim() ? meta.full_name.trim() : "there";
  const wantsGuard = reg === "guard" || role === "guard" || meta.role === "guard";
  const wantsMerchant = reg === "merchant" || role === "merchant" || meta.role === "merchant";
  const profileDone = true;
  const roleDone = wantsMerchant ? hasMerchantRow : wantsGuard ? hasGuardRow : true;

  return (
    <div className="shell mx-auto max-w-lg space-y-4 px-5 py-8 pb-20">
      <PaystackTestBanner />
      <header className="fx-fade-up text-center">
        <p className="muted-label">Getting started</p>
        <h2 className="fx-gradient-text text-2xl font-black">Welcome, {displayName}</h2>
        <p className="mt-2 text-sm text-slate-400">
          {user.email ? (
            <>
              Signed in as <span className="font-semibold text-slate-200">{user.email}</span>
            </>
          ) : (
            "Complete the steps below to start tipping or receiving."
          )}
        </p>
      </header>

      <GlassPanel className="fx-fade-up onboard-step onboard-step--done" glow="amber">
        <p className="text-xs font-bold uppercase text-amber-300/90">Step 1 · Account</p>
        <p className="mt-1 text-sm text-slate-300">Your email is verified and your session is active.</p>
      </GlassPanel>

      <GlassPanel className={`fx-fade-up onboard-step ${profileDone ? "onboard-step--done" : ""}`} glow="slate">
        <p className="text-xs font-bold uppercase text-slate-400">Step 2 · Profile</p>
        <p className="mt-1 text-sm text-slate-400">
          Update your display name in <Link to="/settings">Settings</Link> anytime.
        </p>
      </GlassPanel>

      {wantsMerchant ? (
        <GlassPanel className={`fx-fade-up onboard-step ${roleDone ? "onboard-step--done" : ""}`} glow="amber">
          <p className="text-xs font-bold uppercase text-amber-300/90">Step 3 · Venue</p>
          <p className="mt-1 text-sm text-slate-400">
            {hasMerchantRow
              ? "Your venue is registered. Open the merchant hub for QR and guards."
              : "Add your business name and location to enable venue tipping."}
          </p>
          <Link
            className="btn-gold tap-target mt-4 block text-center no-underline"
            to={hasMerchantRow ? "/merchant" : "/merchant/setup"}
          >
            {hasMerchantRow ? "Open merchant dashboard" : "Register venue"}
          </Link>
        </GlassPanel>
      ) : wantsGuard ? (
        <GlassPanel className={`fx-fade-up onboard-step ${roleDone ? "onboard-step--done" : ""}`} glow="amber">
          <p className="text-xs font-bold uppercase text-amber-300/90">Step 3 · Guard profile</p>
          <p className="mt-1 text-sm text-slate-400">
            {hasGuardRow
              ? "Your guard profile is ready. Share your QR to receive tips."
              : "Add your display name and area so customers can find you."}
          </p>
          <Link
            className="btn-gold tap-target mt-4 block text-center no-underline"
            to={hasGuardRow ? "/guard" : "/guard/setup"}
          >
            {hasGuardRow ? "Open guard dashboard" : "Complete guard profile"}
          </Link>
        </GlassPanel>
      ) : (
        <GlassPanel className={`fx-fade-up onboard-step ${roleDone ? "onboard-step--done" : ""}`} glow="emerald">
          <p className="text-xs font-bold uppercase text-emerald-300/80">Step 3 · Start tipping</p>
          <p className="mt-1 text-sm text-slate-400">
            Browse verified guards and pay securely with Paystack in ZAR.
          </p>
          <Link className="btn-gold tap-target mt-4 block text-center no-underline" to="/customer">
            Find a guard
          </Link>
          <Link className="btn-ghost tap-target mt-2 block text-center no-underline" to="/customer/wallet">
            Open wallet
          </Link>
        </GlassPanel>
      )}

      {roleDone && (
        <p className="fx-fade-up text-center text-sm text-emerald-400/90">You are ready for beta — explore your dashboard.</p>
      )}

      <Link className="block text-center text-sm text-slate-500" to="/">
        Skip to home
      </Link>
    </div>
  );
}
