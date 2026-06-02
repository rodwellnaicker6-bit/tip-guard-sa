import { useCallback, useEffect, useRef, useState } from "react";
import { Link, useNavigate, useSearchParams } from "react-router-dom";
import { useToast } from "../context/useToast";
import { GlassPanel } from "../components/fintech/GlassPanel";
import { TrustRibbon } from "../components/fintech/TrustRibbon";
import { Skeleton } from "../components/Skeleton";
import { recordSuccessfulTip, getLoyaltySnapshot } from "../lib/loyalty";
import { zarFromCents } from "../lib/money";
import { pollPaymentReference, type VerifyPaymentResult } from "../lib/paymentVerify";
import { resolvePaymentReference } from "../lib/paymentReturnParams";
import { ensureTipPayerSession } from "../lib/tipPayerSession";
import { stabilLog } from "../lib/stabilLog";

/** pending → processing → confirmed | failed (never indefinite processing). */
export type PaymentVerifyState = "pending" | "processing" | "confirmed" | "failed";

const MAX_POLL_ATTEMPTS = 28;
const POLL_BASE_MS = 1_200;
const POLL_MAX_MS = 4_000;

function isTerminalSuccess(data: VerifyPaymentResult | null): boolean {
  if (!data) return false;
  return (
    data.verified === true ||
    data.tip_status === "succeeded" ||
    data.transaction_status === "succeeded"
  );
}

function isTerminalFailure(data: VerifyPaymentResult | null): boolean {
  if (!data) return false;
  return (
    data.tip_status === "failed" ||
    data.transaction_status === "failed" ||
    data.paystack_status === "failed" ||
    data.paystack_status === "abandoned"
  );
}

export default function PaymentSuccess() {
  const navigate = useNavigate();
  const [params] = useSearchParams();
  const ref = resolvePaymentReference(params);
  const kind = params.get("kind") ?? "payment";
  const amountParam = params.get("amount_cents");
  const toast = useToast();
  const shown = useRef(false);
  const confirmedToast = useRef(false);
  const [loyaltySnap, setLoyaltySnap] = useState(() => getLoyaltySnapshot());
  const [verifyState, setVerifyState] = useState<PaymentVerifyState>(() =>
    ref ? "processing" : "pending",
  );
  const [pollGeneration, setPollGeneration] = useState(0);
  const [confirmedCents, setConfirmedCents] = useState<number | null>(
    amountParam && !Number.isNaN(Number(amountParam)) ? Number(amountParam) : null,
  );

  useEffect(() => {
    if (shown.current) return;
    shown.current = true;
    toast.info("Confirming payment with Paystack…");
  }, [toast]);

  useEffect(() => {
    void ensureTipPayerSession();
  }, []);

  useEffect(() => {
    stabilLog("pay", "payment success page", {
      ref,
      kind,
      redirect_target: typeof window !== "undefined" ? window.location.href : null,
      amount_cents: amountParam,
    });

    if (!ref) {
      setVerifyState("pending");
      return;
    }

    let cancelled = false;
    let attempts = 0;
    let timer: ReturnType<typeof setTimeout> | null = null;

    const schedule = (delayMs: number, fn: () => void) => {
      timer = setTimeout(fn, delayMs);
    };

    const poll = async () => {
      if (cancelled) return;
      setVerifyState("processing");
      const { data, error } = await pollPaymentReference(ref);
      if (cancelled) return;

      if (isTerminalSuccess(data)) {
        stabilLog("pay", "payment success verified", {
          payment_reference: ref,
          paystack_status: data?.paystack_status,
          tip_status: data?.tip_status,
          transaction_status: data?.transaction_status,
          verified: data?.verified,
        });
        setVerifyState("confirmed");
        const cents =
          data?.amount_cents ??
          (amountParam && !Number.isNaN(Number(amountParam)) ? Number(amountParam) : null);
        if (cents != null) setConfirmedCents(cents);
        if (!confirmedToast.current) {
          confirmedToast.current = true;
          if (kind === "tip") {
            const next = recordSuccessfulTip();
            setLoyaltySnap(next);
            toast.info(`Tip confirmed · ${zarFromCents(cents ?? 0)}`);
          } else {
            toast.info("Payment confirmed");
          }
        }
        return;
      }

      if (isTerminalFailure(data)) {
        setVerifyState("failed");
        navigate(
          `/payment/failure?reason=${encodeURIComponent("verify_failed")}&kind=${encodeURIComponent(kind)}&ref=${encodeURIComponent(ref)}`,
          { replace: true },
        );
        return;
      }

      attempts += 1;
      if (attempts >= MAX_POLL_ATTEMPTS) {
        stabilLog("pay", "payment success verify exhausted", {
          payment_reference: ref,
          attempts,
          last_error: error,
          last_status: data?.tip_status ?? data?.transaction_status,
        });
        setVerifyState("failed");
        return;
      }

      const delay = Math.min(POLL_BASE_MS + attempts * 200, POLL_MAX_MS);
      if (error) {
        schedule(delay, () => void poll());
        return;
      }
      schedule(delay, () => void poll());
    };

    void poll();

    return () => {
      cancelled = true;
      if (timer != null) clearTimeout(timer);
    };
  }, [ref, kind, navigate, toast, amountParam, pollGeneration]);

  const retryVerify = useCallback(() => {
    if (!ref) return;
    setVerifyState("processing");
    setPollGeneration((n) => n + 1);
  }, [ref]);

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
        ? "We could not confirm this payment yet"
        : verifyState === "processing"
          ? "Verifying with Paystack…"
          : "Awaiting payment reference";

  const showCelebration = verifyState === "confirmed";

  return (
    <div className="shell mx-auto flex min-h-screen max-w-md flex-col gap-6 px-5 py-10 pb-16">
      <div className="fx-fade-up flex flex-col items-center text-center">
        <div
          className={`fx-scale-in mb-4 flex h-24 w-24 items-center justify-center rounded-full shadow-[0_0_48px_-8px_rgba(16,185,129,0.45)] ${
            showCelebration
              ? "border-emerald-400/40 bg-emerald-500/15"
              : verifyState === "failed"
                ? "border-red-400/30 bg-red-500/10"
                : "border-amber-400/30 bg-amber-500/10"
          }`}
        >
          <svg width="52" height="52" viewBox="0 0 52 52" fill="none" aria-hidden>
            <circle
              cx="26"
              cy="26"
              r="24"
              stroke={verifyState === "failed" ? "rgba(248,113,113,0.35)" : "rgba(16,185,129,0.35)"}
              strokeWidth="2"
            />
            {verifyState === "failed" ? (
              <path
                d="M18 18l16 16M34 18L18 34"
                stroke="#f87171"
                strokeWidth="3.5"
                strokeLinecap="round"
              />
            ) : (
              <path
                className="fx-check-draw"
                d="M14 27l8 8 16-20"
                stroke="#34d399"
                strokeWidth="3.5"
                strokeLinecap="round"
                strokeLinejoin="round"
                fill="none"
              />
            )}
          </svg>
        </div>
        <h1 className="fx-gradient-text text-3xl font-black tracking-tight">
          {verifyState === "confirmed"
            ? "Payment confirmed"
            : verifyState === "processing"
              ? "Confirming…"
              : verifyState === "failed"
                ? "Confirmation delayed"
                : "Payment received"}
        </h1>
        <p className="mt-2 text-sm leading-relaxed text-slate-400">
          {verifyState === "processing" ? (
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

      <GlassPanel glow={verifyState === "failed" ? "amber" : "emerald"} className="fx-fade-up">
        <p className="text-xs font-bold uppercase tracking-wider text-emerald-300/80">Status</p>
        <p className="mt-2 text-sm text-slate-200">
          {verifyState === "failed"
            ? "Your bank may have approved the charge while our server is still catching up. Tap retry — we will not double-charge you."
            : kind === "wallet_topup"
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
        {kind === "tip" && verifyState === "confirmed" && (
          <p className="mt-3 text-xs text-slate-500">
            Local rewards preview: streak {loyaltySnap.streak} · {loyaltySnap.points} pts (stored on this device only).
          </p>
        )}
      </GlassPanel>

      <div className="fx-fade-up flex flex-col gap-3">
        {verifyState === "failed" && ref ? (
          <button
            type="button"
            className="w-full rounded-2xl bg-gradient-to-r from-amber-400 to-amber-600 py-4 text-sm font-black text-black shadow-lg shadow-amber-500/30"
            onClick={retryVerify}
          >
            Retry confirmation
          </button>
        ) : null}
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
