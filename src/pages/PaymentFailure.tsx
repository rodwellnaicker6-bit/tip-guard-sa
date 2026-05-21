import { useEffect, useRef } from "react";
import { Link, useSearchParams } from "react-router-dom";
import { useToast } from "../context/useToast";
import { paymentFailureMessage } from "../lib/paymentFailureReason";
import { GlassPanel } from "../components/fintech/GlassPanel";
import { TrustRibbon } from "../components/fintech/TrustRibbon";

export default function PaymentFailure() {
  const [params] = useSearchParams();
  const reason = params.get("reason") ?? "unknown";
  const kind = params.get("kind") ?? "payment";
  const toast = useToast();
  const shown = useRef(false);

  const human = paymentFailureMessage(reason);
  const tipReturn =
    typeof sessionStorage !== "undefined" ? sessionStorage.getItem("tipguard_redirect") : null;

  useEffect(() => {
    if (shown.current) return;
    shown.current = true;
    if (reason === "cancelled") {
      toast.info("Checkout closed — no charge was completed.");
    } else {
      toast.error(human);
    }
  }, [human, reason, toast]);

  return (
    <div className="shell mx-auto flex min-h-screen max-w-md flex-col gap-6 px-5 py-10 pb-16">
      <div className="fx-fade-up text-center">
        <div className="mx-auto mb-4 flex h-24 w-24 items-center justify-center rounded-full border border-red-400/35 bg-red-500/10 shadow-[0_0_40px_-10px_rgba(248,113,113,0.35)]">
          <span className="text-4xl font-light text-red-300" aria-hidden>
            ×
          </span>
        </div>
        <h1 className="text-2xl font-black text-white">Not completed</h1>
        <p className="mt-2 text-sm text-slate-400">No funds move until your provider confirms success.</p>
      </div>

      <TrustRibbon>
        <span className="text-white/20">|</span>
        <span>Retry safe</span>
      </TrustRibbon>

      <GlassPanel glow="slate" className="fx-fade-up border-red-500/20">
        <p className="text-xs font-bold uppercase tracking-wider text-red-300/90">Reason</p>
        <p className="mt-2 text-sm text-red-100/90">{human}</p>
        <p className="mt-3 text-xs text-slate-500">
          Fraud monitoring: repeated failures may be rate-limited. If this was unexpected, check your card or try Apple Pay
          / Google Pay inside the same checkout when your gateway exposes them.
        </p>
      </GlassPanel>

      <div className="fx-fade-up flex flex-col gap-3">
        {kind === "wallet_topup" ? (
          <Link
            className="block w-full rounded-2xl bg-gradient-to-r from-amber-400 to-amber-600 py-4 text-center text-sm font-black text-black"
            to="/customer/wallet"
          >
            Try again
          </Link>
        ) : tipReturn?.startsWith("/tip/") ? (
          <Link
            className="block w-full rounded-2xl bg-gradient-to-r from-amber-400 to-amber-600 py-4 text-center text-sm font-black text-black"
            to={tipReturn}
          >
            Try this tip again
          </Link>
        ) : (
          <Link className="block w-full rounded-2xl bg-gradient-to-r from-amber-400 to-amber-600 py-4 text-center text-sm font-black text-black" to="/customer">
            Back to guards
          </Link>
        )}
        <Link className="block text-center text-sm text-slate-500" to="/">
          Home
        </Link>
      </div>
    </div>
  );
}
