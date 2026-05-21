import { useEffect, useMemo, useState, type ReactNode } from "react";
import { Link, useNavigate, useParams, useSearchParams } from "react-router-dom";
import { centsFromRandInput, zarFromCents } from "../lib/money";
import { useAuth } from "../context/useAuth";
import { startTipCheckout } from "../payments/checkoutFlow";
import { hasPaystackPublicKey } from "../services/paymentService";
import { resolveTipTarget } from "../lib/resolveTipTarget";
import { paystackEnvIssue } from "../lib/paystackEnv";
import { CheckoutLoadingOverlay } from "../components/CheckoutLoadingOverlay";
import type { CheckoutPhase } from "../payments/types";
import { GlassPanel } from "../components/fintech/GlassPanel";
import { TrustRibbon } from "../components/fintech/TrustRibbon";

const PRESETS = [10, 20, 50] as const;

/** Mobile-first QR landing: presets → auth → Paystack checkout. */
export default function QrTipLanding() {
  const { token } = useParams<{ token: string }>();
  const [searchParams, setSearchParams] = useSearchParams();
  const navigate = useNavigate();
  const { user } = useAuth();
  const [target, setTarget] = useState<Awaited<ReturnType<typeof resolveTipTarget>>["target"]>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [amount, setAmount] = useState("20");
  const [paying, setPaying] = useState(false);
  const [checkoutPhase, setCheckoutPhase] = useState<CheckoutPhase>("idle");

  const cents = useMemo(() => centsFromRandInput(amount), [amount]);
  const amountLabel = cents != null ? zarFromCents(cents) : "R 0.00";

  useEffect(() => {
    if (!token) return;
    let cancelled = false;
    void (async () => {
      setLoading(true);
      setError(null);
      const { target: resolved, error: resolveErr } = await resolveTipTarget(token);
      if (cancelled) return;
      if (resolveErr || !resolved) {
        setError(resolveErr ?? "This QR code is invalid or has expired.");
        setTarget(null);
      } else {
        setTarget(resolved);
        const preset = searchParams.get("amount");
        if (preset && PRESETS.includes(Number(preset) as (typeof PRESETS)[number])) {
          setAmount(preset);
        } else if (resolved.default_amount_cents) {
          setAmount(String(Math.round(resolved.default_amount_cents / 100)));
        }
      }
      setLoading(false);
    })();
    return () => {
      cancelled = true;
    };
  }, [token, searchParams]);

  function pickPreset(rands: number) {
    setAmount(String(rands));
    const next = new URLSearchParams(searchParams);
    next.set("amount", String(rands));
    setSearchParams(next, { replace: true });
  }

  async function pay() {
    if (!target?.guard_id || cents == null) {
      setError("Choose a valid amount.");
      return;
    }
    if (!user?.id) {
      sessionStorage.setItem("tipguard_redirect", `/tip/${token}?amount=${encodeURIComponent(amount)}`);
      navigate("/login", { replace: true });
      return;
    }
    const payIssue = paystackEnvIssue();
    if (!hasPaystackPublicKey()) {
      setError(payIssue ?? "Payments are not configured on this deployment.");
      return;
    }
    setPaying(true);
    setError(null);
    try {
      await startTipCheckout({
        kind: "tip",
        guardId: target.guard_id,
        amountCents: cents,
        navigate,
        onError: (msg) => setError(msg),
        onCheckoutDismissed: () => setPaying(false),
        onCheckoutPhase: setCheckoutPhase,
      });
    } finally {
      setPaying(false);
      setCheckoutPhase("idle");
    }
  }

  const overlayMsg =
    checkoutPhase === "initializing"
      ? "Creating your secure payment…"
      : checkoutPhase === "opening_checkout"
        ? "Opening Paystack checkout…"
        : "";

  if (!token) {
    return (
      <PageWrap>
        <p className="error">Missing QR token.</p>
        <Link to="/customer" className="text-amber-400">
          Browse guards
        </Link>
      </PageWrap>
    );
  }

  if (loading) {
    return (
      <PageWrap>
        <Spinner />
        <p className="text-sm text-slate-400">Loading secure tip page…</p>
      </PageWrap>
    );
  }

  if (error || !target) {
    return (
      <PageWrap>
        <h1 className="text-xl font-black text-white">Tip link unavailable</h1>
        <p className="error mt-2">{error ?? "This QR code could not be loaded."}</p>
        <p className="mt-2 text-xs text-slate-500">
          Check the code is current, the guard is verified, and your venue has finished setup.
        </p>
        <Link to="/customer" className="mt-4 text-amber-400">
          Browse guards
        </Link>
        <Link to="/" className="mt-2 text-sm text-slate-500">
          Home
        </Link>
      </PageWrap>
    );
  }

  return (
    <div className="shell mx-auto min-h-screen max-w-md px-4 py-6 pb-28">
      {checkoutPhase !== "idle" && overlayMsg ? <CheckoutLoadingOverlay message={overlayMsg} /> : null}
      <header className="mb-4 text-center">
        <p className="text-xs font-bold uppercase tracking-wider text-amber-400/90">TipGuard SA</p>
        <h1 className="mt-1 text-2xl font-black text-white">Tip {target.guard_display_name}</h1>
        <p className="mt-1 text-xs text-slate-500">{target.scan_count} scans · ZAR only</p>
      </header>

      <TrustRibbon />

      <GlassPanel className="mb-4" glow="amber">
        <p className="text-center text-xs font-semibold uppercase text-slate-500">Quick amount</p>
        <div className="mt-3 grid grid-cols-3 gap-2">
          {PRESETS.map((r) => (
            <button
              key={r}
              type="button"
              className={`tap-target rounded-xl border py-3 text-sm font-black transition ${
                amount === String(r)
                  ? "border-amber-400 bg-amber-500/20 text-amber-300"
                  : "border-white/10 bg-white/5 text-slate-200"
              }`}
              onClick={() => pickPreset(r)}
            >
              R{r}
            </button>
          ))}
        </div>
        <label className="mt-4 block">
          <span className="text-xs text-slate-500">Custom (ZAR)</span>
          <input
            className="field tap-target mt-1 w-full rounded-xl border border-white/10 bg-black/30 px-4 py-4 text-center text-2xl font-black text-white"
            value={amount}
            onChange={(e) => setAmount(e.target.value)}
            inputMode="decimal"
            type="number"
            min="1"
          />
        </label>
        <p className="mt-2 text-center text-3xl font-black text-amber-400">{amountLabel}</p>
      </GlassPanel>

      <p className="mb-4 text-center text-xs text-slate-500">
        Apple Pay &amp; Google Pay appear when your gateway and device support them.
      </p>

      {error && <div className="error mb-3">{error}</div>}

      {!hasPaystackPublicKey() && (
        <p className="mb-3 text-center text-sm text-amber-300/90" role="status">
          Payments unavailable — tipping is disabled until Paystack is configured for this deployment.
        </p>
      )}

      <button
        type="button"
        className={`tap-target w-full rounded-2xl bg-gradient-to-r from-amber-400 to-amber-600 py-4 text-lg font-black text-black shadow-lg ${!paying ? "fx-glow-pulse" : ""}`}
        disabled={paying || !hasPaystackPublicKey()}
        onClick={() => void pay()}
      >
        {paying ? "Opening checkout…" : user ? `Pay ${amountLabel}` : "Sign in to pay"}
      </button>

      <p className="mt-4 text-center text-xs text-slate-600">
        <Link to="/privacy" className="underline">
          Privacy
        </Link>
        {" · "}
        <Link to="/terms" className="underline">
          Terms
        </Link>
      </p>
    </div>
  );
}

function PageWrap({ children }: { children: ReactNode }) {
  return (
    <div className="shell mx-auto flex min-h-screen max-w-md flex-col items-center justify-center gap-4 px-4 py-10 text-center">
      {children}
    </div>
  );
}

function Spinner() {
  return (
    <div className="mx-auto h-12 w-12 animate-spin rounded-full border-2 border-amber-400/30 border-t-amber-400" />
  );
}
