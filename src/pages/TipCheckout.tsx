import { memo, useCallback, useEffect, useMemo, useState } from "react";
import { Link, useNavigate, useParams } from "react-router-dom";
import { RPC_DEFAULT_TIMEOUT_MS, withOperationTimeout } from "../lib/operationTimeout";
import { perfLog } from "../lib/perfLog";
import { stabilLog } from "../lib/stabilLog";
import { SlowLoadHint } from "../components/SlowLoadHint";
import { useUiWatchdog } from "../lib/uiWatchdog";
import { supabase } from "../lib/supabase";
import { unwrapRpcSingle } from "../lib/rpcData";
import { centsFromRandInput, zarFromCents } from "../lib/money";
import { hasPaystackPublicKey } from "../services/paymentService";
import { startTipCheckout } from "../payments/checkoutFlow";
import { releaseTipCheckoutLock } from "../services/paystackCore";
import type { PublicGuardRow } from "./CustomerHome";
import { useToast } from "../context/useToast";
import { Skeleton } from "../components/Skeleton";
import { FetchError } from "../components/FetchError";
import { GlassPanel } from "../components/fintech/GlassPanel";
import { TrustRibbon } from "../components/fintech/TrustRibbon";
import { CheckoutLoadingOverlay } from "../components/CheckoutLoadingOverlay";
import type { CheckoutPhase } from "../payments/types";

const PRESETS = [10, 20, 50] as const;

function TipCheckoutPage() {
  const { guardId } = useParams();
  const navigate = useNavigate();
  const toast = useToast();
  const [guard, setGuard] = useState<PublicGuardRow | null>(null);
  const [amount, setAmount] = useState("20");
  const [error, setError] = useState<string | null>(null);
  const [starting, setStarting] = useState(false);
  const [checkoutPhase, setCheckoutPhase] = useState<CheckoutPhase>("idle");
  const [loading, setLoading] = useState(true);
  const [reload, setReload] = useState(0);
  const slowLoad = useUiWatchdog(loading);

  const cents = useMemo(() => centsFromRandInput(amount), [amount]);
  const amountLabel = cents != null ? zarFromCents(cents) : "R 0.00";

  useEffect(() => {
    if (!guardId) return;
    let cancelled = false;
    const watchdog = window.setTimeout(() => {
      if (cancelled) return;
      setLoading(false);
      setError((prev) => prev ?? "Loading guard timed out. Please try again.");
    }, RPC_DEFAULT_TIMEOUT_MS + 1_000);

    (async () => {
      setLoading(true);
      const t0 = performance.now();
      try {
        const { data, error: err } = await withOperationTimeout(
          "rpc",
          "get_public_guard",
          (signal) => supabase.rpc("get_public_guard", { p_id: guardId }).abortSignal(signal),
          RPC_DEFAULT_TIMEOUT_MS,
        );
        if (cancelled) return;
        const row = unwrapRpcSingle<PublicGuardRow>(data);
        if (err || !row) {
          setError(err?.message ?? "Guard not found");
          setGuard(null);
        } else {
          setGuard(row as PublicGuardRow);
          setError(null);
        }
        perfLog("get_public_guard", Math.round(performance.now() - t0), { ok: !err && !!row });
      } catch {
        if (!cancelled) {
          setError("Loading guard timed out. Please try again.");
          setGuard(null);
        }
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
      window.clearTimeout(watchdog);
    };
  }, [guardId, reload]);

  useEffect(() => () => releaseTipCheckoutLock(), []);

  const startPayment = useCallback(async () => {
    stabilLog("pay", "Pay clicked (tip checkout)", { hasGuard: !!guardId, hasAmount: cents != null });
    setError(null);
    if (!guardId || cents == null) {
      setError("Enter a valid Rand amount.");
      return;
    }
    setStarting(true);
    try {
      await startTipCheckout({
        kind: "tip",
        guardId,
        amountCents: cents,
        navigate,
        onError: (msg) => {
          releaseTipCheckoutLock();
          setError(msg);
          toast.error(msg);
        },
        onCheckoutDismissed: () => {
          releaseTipCheckoutLock();
          toast.info("Checkout closed — no charge yet.");
        },
        onCheckoutPhase: setCheckoutPhase,
      });
    } finally {
      setStarting(false);
      setCheckoutPhase("idle");
    }
  }, [guardId, cents, navigate, toast]);

  const onRetryLoad = useCallback(() => setReload((n) => n + 1), []);

  const overlayMsg =
    checkoutPhase === "initializing"
      ? "Creating your secure payment…"
      : checkoutPhase === "opening_checkout"
        ? "Opening Paystack checkout…"
        : "";

  if (loading) {
    return (
      <div className="shell mx-auto flex min-h-screen max-w-md flex-col gap-3 px-5 py-8">
        <Skeleton style={{ height: 26, width: "70%" }} />
        <Skeleton style={{ height: 16, width: "40%" }} />
        <Skeleton style={{ height: 48, width: "100%", marginTop: 16 }} />
        <Skeleton style={{ height: 52, width: "100%", borderRadius: 16, marginTop: 12 }} />
        <SlowLoadHint show={slowLoad} />
      </div>
    );
  }

  if (!guard) {
    return (
      <div className="shell mx-auto max-w-md space-y-4 px-5 py-8">
        {error ? (
          <FetchError message={error} onRetry={onRetryLoad} retryLabel="Reload guard" />
        ) : (
          <p>Could not load this guard.</p>
        )}
        <Link to="/customer" className="tap-target inline-block text-amber-400">
          Back
        </Link>
      </div>
    );
  }

  return (
    <div className="shell mx-auto flex min-h-screen max-w-md flex-col gap-5 px-5 py-8 pb-[max(7rem,env(safe-area-inset-bottom))]">
      {checkoutPhase !== "idle" && overlayMsg ? <CheckoutLoadingOverlay message={overlayMsg} /> : null}
      <div className="fx-fade-up">
        <p className="muted-label">Tip checkout</p>
        <h2 className="text-2xl font-extrabold tracking-tight text-slate-50">Tip {guard.display_name}</h2>
        <p className="mt-1 text-sm text-slate-400">{guard.location}</p>
      </div>

      <TrustRibbon />

      <GlassPanel className="fx-fade-up" glow="amber">
        <div className="mb-3 flex items-center gap-3">
          <div className="flex h-12 w-12 items-center justify-center rounded-xl bg-gradient-to-br from-amber-400 to-amber-600 text-lg font-black text-black">
            {guard.avatar_initials ?? "TG"}
          </div>
          <div>
            <p className="text-xs font-semibold uppercase tracking-wide text-emerald-400/90">Verified guard</p>
            <p className="text-sm text-slate-400">{guard.province ?? "South Africa"}</p>
          </div>
        </div>
        <p className="text-xs text-slate-500">Amount (ZAR)</p>
        <div className="mt-2 grid grid-cols-5 gap-1.5 sm:gap-2">
          {PRESETS.map((r) => (
            <button
              key={r}
              type="button"
              className={`tap-target rounded-xl border px-1 py-2 text-xs font-bold transition sm:text-sm ${
                amount === String(r)
                  ? "border-amber-400/80 bg-amber-500/15 text-amber-300"
                  : "border-white/10 bg-white/5 text-slate-200 hover:border-amber-400/40"
              }`}
              onClick={() => setAmount(String(r))}
            >
              R{r}
            </button>
          ))}
        </div>
        <label className="mt-3 block">
          <span className="text-xs text-slate-500">Custom</span>
          <input
            className="field tap-target mt-1 w-full rounded-xl border border-white/10 bg-black/30 px-3 py-3 text-lg font-semibold text-white"
            value={amount}
            onChange={(e) => setAmount(e.target.value)}
            type="number"
            min="1"
            step="1"
            inputMode="decimal"
          />
        </label>
        <p className="mt-2 text-center text-2xl font-black text-amber-400">{amountLabel}</p>
      </GlassPanel>

      <p className="fx-fade-up text-center text-xs leading-relaxed text-slate-500">
        One-tap presets · Apple Pay &amp; Google Pay appear when your gateway (e.g. Paystack) and device support them in
        South Africa. NFC tap-to-tip is prepared in code for supported Android Chrome builds.
      </p>

      {error ? (
        <FetchError message={error} onRetry={() => void startPayment()} retryLabel="Retry payment" />
      ) : null}

      <button
        type="button"
        className={`hub-primary-cta tap-target fx-fade-up rounded-2xl bg-gradient-to-r from-amber-400 to-amber-600 py-4 text-base font-black text-black shadow-lg shadow-amber-500/25 transition active:scale-[0.99] disabled:opacity-50 ${!starting ? "fx-glow-pulse" : ""}`}
        onClick={() => void startPayment()}
        disabled={!hasPaystackPublicKey() || starting}
        aria-busy={starting}
      >
        {starting ? (
          <span className="inline-flex items-center justify-center gap-2">
            <span className="h-4 w-4 animate-spin rounded-full border-2 border-black/30 border-t-black" />
            Opening secure checkout…
          </span>
        ) : (
          `Pay ${amountLabel}`
        )}
      </button>
      {!hasPaystackPublicKey() && (
        <p className="text-center text-sm text-amber-300/90" role="status">
          Payments unavailable — checkout is disabled until Paystack is configured for this deployment.
        </p>
      )}

      <Link to="/customer" className="text-center text-sm text-amber-400/90">
        All guards
      </Link>
    </div>
  );
}

export default memo(TipCheckoutPage);
