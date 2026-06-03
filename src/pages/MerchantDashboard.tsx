import { memo } from "react";
import { Link } from "react-router-dom";
import { useAuth } from "../context/useAuth";
import { PAYMENT_PROVIDERS } from "../lib/paymentProviders";
import { Skeleton } from "../components/Skeleton";
import { StatCardsSkeleton } from "../components/StatCardsSkeleton";
import { ProfileCompletionCard } from "../components/ProfileCompletionCard";
import { FetchError } from "../components/FetchError";
import { MerchantAnalyticsPanel } from "../components/MerchantAnalyticsPanel";
import { PayoutSchedulePanel } from "../components/PayoutSchedulePanel";
import { useMerchantVenue } from "../hooks/useMerchantVenue";
import { SlowLoadHint } from "../components/SlowLoadHint";
import { useUiWatchdog } from "../lib/uiWatchdog";

function MerchantDashboardPage() {
  const { role, profileFields, signOut } = useAuth();
  const {
    merchant,
    loading,
    error,
    payoutSchedule,
    nextPayoutAt,
    minPayoutCents,
    payoutSchemaComplete,
    reload,
  } = useMerchantVenue();
  const slowLoad = useUiWatchdog(loading);

  if (loading) {
    return (
      <div className="shell dashboard-hub mx-auto max-w-lg space-y-5 px-4 py-8 pb-16 sm:px-5">
        <header className="page-header">
          <Skeleton style={{ height: 12, width: "40%" }} />
          <Skeleton style={{ height: 28, width: "70%", marginTop: 8 }} />
        </header>
        <StatCardsSkeleton />
        <SlowLoadHint show={slowLoad} />
        <p className="text-center text-sm text-slate-500" role="status">
          Loading your venue…
        </p>
      </div>
    );
  }

  if (error) {
    return (
      <div className="shell dashboard-hub mx-auto max-w-lg space-y-4 px-4 py-10 sm:px-5">
        <FetchError message={error} onRetry={reload} retryLabel="Retry loading venue" />
        <Link className="tap-target block text-center text-sm font-semibold text-amber-400" to="/merchant/setup">
          Register or complete venue
        </Link>
        <Link className="tap-target block text-center text-sm text-slate-500" to="/">
          Return home
        </Link>
      </div>
    );
  }

  if (!merchant) {
    return (
      <div className="shell dashboard-hub mx-auto max-w-lg space-y-4 px-4 py-10 sm:px-5">
        <header className="page-header">
          <p className="muted-label">Merchant</p>
          <h2 className="font-black text-white">Venue hub</h2>
        </header>
        <p className="text-sm text-slate-400">
          {role === "merchant"
            ? "Your account has the merchant role, but no venue row is linked yet."
            : "Add a venue profile to unlock this dashboard."}
        </p>
        <Link className="btn-gold tap-target min-h-[48px] items-center justify-center rounded-2xl px-4 font-bold" to="/merchant/setup">
          {role === "merchant" ? "Complete venue registration" : "Register venue"}
        </Link>
        <Link className="tap-target block text-center text-sm text-slate-500" to="/">
          Return home
        </Link>
      </div>
    );
  }

  return (
    <div className="shell dashboard-hub mx-auto max-w-lg space-y-5 px-4 py-8 pb-16 sm:px-5">
      <header className="page-header fx-fade-up min-w-0">
        <p className="muted-label">Venue hub</p>
        <h2 className="font-black text-white break-words">{merchant.business_name ?? "Your venue"}</h2>
        <p className="text-slate-400">{merchant.location ?? "South Africa"}</p>
        {(merchant.risk_score ?? 0) > 0 && (
          <span
            className={`mt-2 inline-block rounded-full px-3 py-1 text-xs font-bold ${
              (merchant.risk_score ?? 0) >= 50
                ? "bg-red-500/20 text-red-300"
                : "bg-amber-500/20 text-amber-300"
            }`}
          >
            Risk score {merchant.risk_score}/100
          </span>
        )}
      </header>

      <nav className="hub-nav-grid" aria-label="Venue hub">
        <a
          href="#payout-preferences"
          className="hub-nav-link border-emerald-500/30 bg-emerald-500/10 font-bold text-emerald-200"
        >
          Payouts
        </a>
        <Link className="hub-nav-link bg-white/10 text-amber-200" to="/merchant/locations">
          Locations
        </Link>
        <Link className="hub-nav-link bg-white/10 text-amber-200" to="/merchant/qr">
          QR codes
        </Link>
        <Link className="hub-nav-link bg-white/10 text-amber-200" to="/merchant/guards">
          Guards
        </Link>
      </nav>

      <div className="card min-w-0 scroll-mt-24 rounded-2xl border-2 border-amber-500/40 bg-amber-500/5 p-4 fx-fade-up shadow-lg shadow-amber-500/10">
        <PayoutSchedulePanel
          table="merchants"
          entityId={merchant.id}
          schedule={payoutSchedule}
          nextPayoutAt={nextPayoutAt}
          minimumPayoutThresholdCents={minPayoutCents}
          prominent
          schemaUnavailable={!payoutSchemaComplete}
          onSaved={reload}
        />
      </div>

      <ProfileCompletionCard fields={profileFields} />

      <div className="card min-w-0 rounded-2xl border border-white/10 bg-white/[0.04] p-4 fx-fade-up">
        <strong className="text-slate-200">Tips &amp; volume</strong>
        <p className="mt-1 text-sm text-slate-400">Live aggregates from tips received through your venue QR codes.</p>
        <div className="mt-4">
          <MerchantAnalyticsPanel />
        </div>
      </div>

      <div className="card stack min-w-0 rounded-2xl border border-white/10 bg-white/[0.04] p-4 fx-fade-up">
        <strong className="text-slate-200">Venue status</strong>
        <p className="mt-1 text-sm text-slate-400">
          {merchant.verified ? "Verified with TipGuard" : "Pending verification — contact your operator if this stays pending."}
        </p>
      </div>

      <div className="card stack min-w-0 rounded-2xl border border-amber-500/20 bg-amber-500/5 p-4">
        <strong className="text-amber-200">Compliance</strong>
        <p className="mt-1 text-sm text-slate-400">
          Submit venue details for operator review (POPIA-aligned self-attestation). Required before national rollout.
        </p>
        <Link
          className="tap-target mt-3 inline-flex min-h-[44px] w-full items-center justify-center rounded-xl bg-amber-500/20 px-4 text-sm font-bold text-amber-200 sm:w-auto"
          to="/merchant/kyc"
        >
          Venue verification
        </Link>
      </div>

      <div className="card stack min-w-0 rounded-2xl border border-white/10 bg-white/[0.04] p-4">
        <strong className="text-slate-200">Payments</strong>
        <p className="mt-1 text-sm text-slate-400">
          Customer tips use Paystack on the guard checkout path. Additional providers are registered for upcoming work:
        </p>
        <ul className="mt-2 list-disc space-y-1 pl-5 text-sm text-slate-400">
          {PAYMENT_PROVIDERS.map((p) => (
            <li key={p.id}>
              <strong className="text-slate-200">{p.displayName}</strong>
              {p.productionReady ? " — active" : " — planned"}
            </li>
          ))}
        </ul>
      </div>

      <div className="card stack min-w-0 rounded-2xl border border-white/10 bg-white/[0.04] p-4">
        <strong className="text-slate-200">Locations &amp; guards</strong>
        <p className="mt-1 text-sm text-slate-400">Manage sites and guard profiles linked to this venue.</p>
        <div className="hub-nav-grid mt-3">
          <Link className="hub-nav-link bg-white/10 text-amber-200" to="/merchant/locations">
            Locations
          </Link>
          <Link className="hub-nav-link bg-white/10 text-amber-200" to="/merchant/qr">
            QR codes
          </Link>
          <Link className="hub-nav-link bg-white/10 text-amber-200" to="/merchant/guards">
            Guards
          </Link>
          <Link className="hub-nav-link bg-white/10 text-amber-200" to="/merchant/disputes">
            Disputes
          </Link>
        </div>
      </div>

      <nav className="flex flex-wrap gap-4 text-sm font-semibold">
        <Link className="tap-target text-amber-400" to="/settings">
          Account settings
        </Link>
        <Link className="tap-target text-slate-500" to="/">
          Home
        </Link>
        <button className="tap-target text-slate-400 underline-offset-2 hover:underline" type="button" onClick={() => void signOut()}>
          Sign out
        </button>
      </nav>
    </div>
  );
}

export default memo(MerchantDashboardPage);
