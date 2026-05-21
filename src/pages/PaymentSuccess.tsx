import { useEffect, useRef, useState } from "react";
import { Link, useNavigate, useSearchParams } from "react-router-dom";
import { useToast } from "../context/useToast";
import { GlassPanel } from "../components/fintech/GlassPanel";
import { TrustRibbon } from "../components/fintech/TrustRibbon";
import { Skeleton } from "../components/Skeleton";
import { recordSuccessfulTip, getLoyaltySnapshot } from "../lib/loyalty";
import { zarFromCents } from "../lib/money";
import { verifyPaystackReference } from "../lib/paymentVerify";

type VerifyState = "idle" | "polling" | "confirmed" | "pending" | "failed";

export default function PaymentSuccess() {
  const navigate = useNavigate();
  const [params] = useSearchParams();
  const ref = params.get("ref");
  const kind = params.get("kind") ?? "payment";
  const amountParam = params.get("amount_cents");
  const toast = useToast();
  const shown = useRef(false);
  const [loyaltySnap, setLoyaltySnap] = useState(() => getLoyaltySnapshot());
  const [verifyState, setVerifyState] = useState<VerifyState>(ref ? "polling" : "idle");
  const [confirmedCents, setConfirmedCents] = useState<number | null>(
    amountParam && !Number.isNaN(Number(amountParam)) ? Number(amountParam) : null,
  );

  useEffect(() => {
    if (shown.current) return;
    shown.current = true;
    toast.info("Confirming payment with Paystack…");
  }, [toast]);

  useEffect(() => {
    if (!ref) return;
    let cancelled = false;
    let attempts = 0;
    const maxAttempts = 8;

    const poll = async () => {
      const { data, error } = await verifyPaystackReference(ref);
      if (cancelled) return;
      if (error) {
        attempts += 1;
        if (attempts >= maxAttempts) {
          setVerifyState("pending");
          return;
        }
        setTimeout(poll, 1500);
        return;
      }
      if (data?.verified || data?.tip_status === "succeeded" || data?.transaction_status === "succeeded") {
        setVerifyState("confirmed");
        if (data.amount_cents != null) setConfirmedCents(data.amount_cents);
        if (kind === "tip") {
          const next = recordSuccessfulTip();
          setLoyaltySnap(next);
          toast.info(`Tip confirmed · ${zarFromCents(data.amount_cents ?? confirmedCents ?? 0)}`);
        } else {
          toast.info("Payment confirmed");
        }
        return;
      }
      if (data?.tip_status === "failed" || data?.transaction_status === "failed" || data?.paystack_status === "failed") {
        setVerifyState("failed");
        navigate(`/payment/failure?reason=${encodeURIComponent("verify_failed")}&kind=${encodeURIComponent(kind)}`, {
          replace: true,
        });
        return;
      }
      attempts += 1;
      if (attempts < maxAttempts) {
        setVerifyState("polling");
        setTimeout(poll, 1500);
      } else {
        setVerifyState("pending");
      }
    };

    void poll();
    return () => {
      cancelled = true;
    };
  }, [ref, kind, navigate, toast, confirmedCents]);

  function downloadReceipt() {
    const cents = confirmedCents;
    const lines = [
      "TipGuard SA — payment receipt",
      `Date: ${new Date().toISOString()}`,
      `Reference: ${ref ?? "n/a"}`,
      `Type: ${kind}`,
      `Verification: ${verifyState}`,
      cents != null ? `Amount: ${zarFromCents(cents)}` : "",
      "",
      "Final settlement is confirmed when Paystack reports success to our server.",
    ].filter(Boolean) as string[];
    const blob = new Blob([lines.join("\n")], { type: "text/plain;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `tipguard-receipt-${ref ?? "payment"}.txt`;
    a.click();
    URL.revokeObjectURL(url);
  }

  const statusLabel =
    verifyState === "confirmed"
      ? "Confirmed with Paystack"
      : verifyState === "failed"
        ? "Payment could not be confirmed"
        : verifyState === "polling"
          ? "Verifying with Paystack…"
          : "Processing — this can take a few seconds";

  const showCelebration = verifyState === "confirmed" || verifyState === "idle";

  return (
    <div className="shell mx-auto flex min-h-screen max-w-md flex-col gap-6 px-5 py-10 pb-16">
      <div className="fx-fade-up flex flex-col items-center text-center">
        <div
          className={`fx-scale-in mb-4 flex h-24 w-24 items-center justify-center rounded-full shadow-[0_0_48px_-8px_rgba(16,185,129,0.45)] ${
            showCelebration
              ? "border-emerald-400/40 bg-emerald-500/15"
              : "border-amber-400/30 bg-amber-500/10"
          }`}
        >
          <svg width="52" height="52" viewBox="0 0 52 52" fill="none" aria-hidden>
            <circle cx="26" cy="26" r="24" stroke="rgba(16,185,129,0.35)" strokeWidth="2" />
            <path
              className="fx-check-draw"
              d="M14 27l8 8 16-20"
              stroke="#34d399"
              strokeWidth="3.5"
              strokeLinecap="round"
              strokeLinejoin="round"
              fill="none"
            />
          </svg>
        </div>
        <h1 className="fx-gradient-text text-3xl font-black tracking-tight">
          {verifyState === "confirmed" ? "Payment confirmed" : verifyState === "polling" ? "Confirming…" : "Payment received"}
        </h1>
        <p className="mt-2 text-sm leading-relaxed text-slate-400">
          {verifyState === "polling" ? (
            <span className="inline-flex items-center gap-2">
              <Skeleton style={{ width: 14, height: 14, borderRadius: "50%" }} />
              Confirming with Paystack…
            </span>
          ) : (
            statusLabel
          )}
        </p>
      </div>

      <TrustRibbon />

      <GlassPanel glow="emerald" className="fx-fade-up">
        <p className="text-xs font-bold uppercase tracking-wider text-emerald-300/80">Status</p>
        <p className="mt-2 text-sm text-slate-200">
          {kind === "wallet_topup"
            ? "Wallet credits after charge.success is verified server-side."
            : kind === "tip"
              ? "Tip is attributed to your guard after charge.success is verified."
              : "Payment pipeline acknowledged."}
        </p>
        {ref && (
          <p className="mt-3 font-mono text-xs text-amber-200/90">
            Ref <span className="select-all">{ref}</span>
          </p>
        )}
        {confirmedCents != null && (
          <p className="mt-2 text-lg font-black text-amber-400">{zarFromCents(confirmedCents)}</p>
        )}
        {kind === "tip" && (
          <p className="mt-3 text-xs text-slate-500">
            Local rewards preview: streak {loyaltySnap.streak} · {loyaltySnap.points} pts (stored on this device only).
          </p>
        )}
      </GlassPanel>

      <div className="fx-fade-up flex flex-col gap-3">
        <button
          type="button"
          className="w-full rounded-2xl border border-white/15 bg-white/5 py-3 text-sm font-bold text-white backdrop-blur-md transition hover:bg-white/10"
          onClick={downloadReceipt}
        >
          Download receipt (.txt)
        </button>
        {kind === "wallet_topup" ? (
          <Link
            className="block w-full rounded-2xl bg-gradient-to-r from-amber-400 to-amber-600 py-4 text-center text-sm font-black text-black shadow-lg shadow-amber-500/30"
            to="/customer/wallet"
            onClick={() => sessionStorage.setItem("tipguard_refresh_wallet", "1")}
          >
            Back to wallet
          </Link>
        ) : (
          <Link
            className="block w-full rounded-2xl bg-gradient-to-r from-amber-400 to-amber-600 py-4 text-center text-sm font-black text-black shadow-lg shadow-amber-500/30"
            to="/customer"
          >
            Browse guards
          </Link>
        )}
        <Link className="block text-center text-sm font-semibold text-amber-400/90" to="/customer/transactions">
          Full transaction history
        </Link>
        <Link className="block text-center text-sm text-slate-500" to="/">
          Home
        </Link>
      </div>
    </div>
  );
}
