import { useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { Link, useNavigate, useParams, useSearchParams } from "react-router-dom";
import { centsFromRandInput, zarFromCents } from "../lib/money";
import { useAuth } from "../context/useAuth";
import { startTipCheckout } from "../payments/checkoutFlow";
import { releaseTipCheckoutLock } from "../services/paystackCore";
import { hasPaystackPublicKey } from "../services/paymentService";
import { peekCachedResolve, readCachedTipDisplayName, resolveTipTarget } from "../lib/resolveTipTarget";
import {
  QR_AUTH_GRACE_MS,
  confirmRequiresSignInForPayment,
  isSessionRestoreInFlight,
  logQrAuth,
  qrAuthTimestamp,
  subscribeQrAuthSession,
  waitForStableSession,
} from "../lib/qrAuthSession";
import { useGracePeriod } from "../hooks/useGracePeriod";
import { perfMark } from "../lib/perfTelemetry";
import { SlowLoadHint } from "../components/SlowLoadHint";
import { useUiWatchdog } from "../lib/uiWatchdog";
import { logAuth } from "../lib/authDebug";
import { stabilLog } from "../lib/stabilLog";
import { paystackEnvIssue } from "../lib/paystackEnv";
import { CheckoutLoadingOverlay } from "../components/CheckoutLoadingOverlay";
import type { CheckoutPhase } from "../payments/types";
import { GlassPanel } from "../components/fintech/GlassPanel";
import { TrustRibbon } from "../components/fintech/TrustRibbon";
import { Skeleton } from "../components/Skeleton";
import { FetchError } from "../components/FetchError";
import { useOnlineStatus } from "../hooks/useOnlineStatus";
import { recordError } from "../lib/errorTelemetry";

const PRESETS = [10, 20, 50] as const;
const QR_LOAD_TIMEOUT_MS = 10_000;

function initialTipState(token: string | undefined) {
  const cached = token ? peekCachedResolve(token) : null;
  return {
    target: cached?.target ?? null,
    loading: !cached?.target,
  };
}

/** Mobile-first QR landing: presets → auth → Paystack checkout. */
function QrTipLandingContent() {
  const { token } = useParams<{ token: string }>();
  const [searchParams, setSearchParams] = useSearchParams();
  const navigate = useNavigate();
  const { user, session, authReady, sessionReady } = useAuth();
  const sessionUserId = user?.id ?? session?.user?.id ?? null;
  const sessionMissing = sessionReady && !sessionUserId;
  const sessionGraceElapsed = useGracePeriod(sessionMissing, QR_AUTH_GRACE_MS);
  const [, setAuthSessionTick] = useState(0);
  useEffect(() => subscribeQrAuthSession(() => setAuthSessionTick((n) => n + 1)), []);
  const sessionRestoreInFlight = isSessionRestoreInFlight(
    sessionReady,
    sessionMissing,
    sessionGraceElapsed,
  );
  const payBlockedByAuth = sessionRestoreInFlight;
  const [target, setTarget] = useState<Awaited<ReturnType<typeof resolveTipTarget>>["target"]>(() =>
    initialTipState(token).target,
  );
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(() => initialTipState(token).loading);
  const [amount, setAmount] = useState("20");
  const [paying, setPaying] = useState(false);
  const [checkoutPhase, setCheckoutPhase] = useState<CheckoutPhase>("idle");
  const [reload, setReload] = useState(0);
  const online = useOnlineStatus();
  const payInFlightRef = useRef(false);
  const optimisticName = useMemo(() => readCachedTipDisplayName(token), [token]);
  const slowLoad = useUiWatchdog(loading);

  useEffect(() => () => releaseTipCheckoutLock(), []);

  useEffect(() => {
    logQrAuth("mount / session snapshot", {
      sessionReady,
      authReady,
      userId: user?.id ?? null,
      sessionUserId: session?.user?.id ?? null,
      sessionMissing,
      sessionGraceElapsed,
      sessionRestoreInFlight,
    });
  }, [
    token,
    sessionReady,
    authReady,
    user?.id,
    session?.user?.id,
    sessionMissing,
    sessionGraceElapsed,
    sessionRestoreInFlight,
  ]);

  const cents = useMemo(() => centsFromRandInput(amount), [amount]);
  const amountLabel = cents != null ? zarFromCents(cents) : "R 0.00";

  useEffect(() => {
    if (!token) return;
    let cancelled = false;
    const endHydration = perfMark("qr:tip_page_hydration");
    const hadCache = Boolean(peekCachedResolve(token)?.target);
    void (async () => {
      if (!hadCache) {
        setLoading(true);
        setError(null);
      }
      const { target: resolved, error: resolveErr } = await resolveTipTarget(token);
      if (cancelled) return;
      if (resolveErr || !resolved) {
        setError(resolveErr ?? "This QR code is invalid or has expired.");
        setTarget(null);
      } else {
        setTarget(resolved);
        const preset = searchParams.get("amount");
        const presetNum = preset ? Number(preset) : NaN;
        if (preset && Number.isFinite(presetNum) && presetNum >= 1 && presetNum <= 5000) {
          setAmount(String(Math.round(presetNum)));
        } else if (resolved.default_amount_cents) {
          setAmount(String(Math.round(resolved.default_amount_cents / 100)));
        }
      }
      setLoading(false);
      endHydration();
    })();
    return () => {
      cancelled = true;
    };
    // Amount from URL is applied on resolve only — preset buttons update amount directly (no re-resolve).
    // eslint-disable-next-line react-hooks/exhaustive-deps -- searchParams must not retrigger resolve_tip_target
  }, [token, reload]);

  useEffect(() => {
    if (!loading) return;
    const t = window.setTimeout(() => {
      setLoading(false);
      setError((prev) => prev ?? "This tip page took too long to load. Check your connection and try again.");
    }, QR_LOAD_TIMEOUT_MS);
    return () => window.clearTimeout(t);
  }, [loading]);

  function pickPreset(rands: number) {
    setAmount(String(rands));
    const next = new URLSearchParams(searchParams);
    next.set("amount", String(rands));
    setSearchParams(next, { replace: true });
  }

  async function pay() {
    if (payInFlightRef.current) return;
    stabilLog("pay", "Pay clicked (QR landing)", {
      hasTarget: !!target?.guard_id,
      hasAmount: cents != null,
      t: qrAuthTimestamp(),
    });
    if (!target?.guard_id || cents == null) {
      setError("Choose a valid amount.");
      return;
    }
    if (payBlockedByAuth) {
      logQrAuth("pay blocked — session restore in flight", {
        sessionReady,
        sessionRestoreInFlight,
      });
      setError("Restoring your session — wait a moment and tap Pay again.");
      return;
    }
    const stable = await waitForStableSession({
      sessionReady,
      reactUserId: user?.id,
      reactSessionUserId: session?.user?.id,
    });
    if (!stable.ok) {
      if (stable.reason === "session_not_ready") {
        logQrAuth("pay blocked — waitForStableSession session_not_ready", { waitedMs: stable.waitedMs });
        setError("Checking your session — wait a moment and tap Pay again.");
        return;
      }
      if (!sessionGraceElapsed) {
        logQrAuth("pay deferred — stable wait during grace", { reason: stable.reason, waitedMs: stable.waitedMs });
        setError("Restoring your session — wait a moment and tap Pay again.");
        return;
      }
      const signedOut = await confirmRequiresSignInForPayment();
      if (!signedOut) {
        logQrAuth("pay retry hint — session recovered after stable wait", { waitedMs: stable.waitedMs });
        setError("Session restored. Tap Pay again.");
        return;
      }
      logAuth("QR pay redirect to login (confirmed sign-out)", { token });
      logQrAuth("redirect /login after confirmed sign-out", { token });
      sessionStorage.setItem("tipguard_redirect", `/tip/${token}?amount=${encodeURIComponent(amount)}`);
      navigate("/login", { replace: true });
      return;
    }
    const payerId = stable.userId;
    if (!user?.id) {
      logAuth("QR pay using recovered session (React user was briefly null)", { payerId });
      logQrAuth("pay using recovered session id", { payerId, waitedMs: stable.waitedMs });
    }
    const payIssue = paystackEnvIssue();
    if (!hasPaystackPublicKey()) {
      setError(payIssue ?? "Payments are not configured on this deployment.");
      return;
    }
    payInFlightRef.current = true;
    setPaying(true);
    setError(null);
    try {
      await startTipCheckout({
        kind: "tip",
        guardId: target.guard_id,
        sourceLinkToken: token,
        amountCents: cents,
        navigate,
        onRequiresAuth: () => {
          void (async () => {
            releaseTipCheckoutLock();
            if (!(await confirmRequiresSignInForPayment())) {
              logQrAuth("onRequiresAuth ignored — session still present", {});
              setError("Session restored. Tap Pay again.");
              return;
            }
            logQrAuth("onRequiresAuth → /login", { token });
            sessionStorage.setItem("tipguard_redirect", `/tip/${token}?amount=${encodeURIComponent(amount)}`);
            navigate("/login", { replace: true });
          })();
        },
        onError: (msg) => {
          releaseTipCheckoutLock();
          setError(msg);
        },
        onCheckoutDismissed: () => {
          releaseTipCheckoutLock();
          setPaying(false);
        },
        onCheckoutPhase: setCheckoutPhase,
      });
    } catch (e) {
      releaseTipCheckoutLock();
      const msg = e instanceof Error ? e.message : "Payment could not start.";
      recordError("qr_tip_checkout", msg, { code: "exception" });
      setError("Something went wrong starting checkout. Please try again.");
    } finally {
      payInFlightRef.current = false;
      setPaying(false);
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
    const label = optimisticName ? `Tip ${optimisticName}` : "Loading secure tip page…";
    return (
      <PageWrap>
        <p className="text-xs font-bold uppercase tracking-wider text-amber-400/90">TipGuard SA</p>
        <h1 className="mt-2 text-xl font-black text-white">{label}</h1>
        <Skeleton style={{ height: 180, width: "100%", borderRadius: 20, marginTop: 16 }} />
        <p className="text-sm text-slate-400" role="status">
          {optimisticName ? "Refreshing tip details…" : "Loading secure tip page…"}
        </p>
        <SlowLoadHint show={slowLoad} message="Connection is slow — still loading…" />
      </PageWrap>
    );
  }

  if (!online && !loading) {
    return (
      <PageWrap>
        <h1 className="text-xl font-black text-white">You are offline</h1>
        <p className="mt-2 text-sm text-slate-400">Reconnect to load this tip page and pay securely.</p>
        <button
          type="button"
          className="btn-ghost tap-target mt-4 w-full"
          onClick={() => setReload((n) => n + 1)}
        >
          Try again
        </button>
      </PageWrap>
    );
  }

  if (error || !target) {
    return (
      <PageWrap>
        <h1 className="text-xl font-black text-white">Tip link unavailable</h1>
        <FetchError
          message={error ?? "This QR code could not be loaded."}
          onRetry={() => setReload((n) => n + 1)}
        />
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
    <div className="shell qr-landing mx-auto min-h-[100dvh] max-w-md overflow-x-hidden px-4 py-6 pb-[max(7rem,env(safe-area-inset-bottom))]">
      {checkoutPhase !== "idle" && overlayMsg ? <CheckoutLoadingOverlay message={overlayMsg} /> : null}
      <header className="fx-fade-up mb-4 text-center">
        <p className="text-xs font-bold uppercase tracking-wider text-amber-400/90">TipGuard SA</p>
        <h1 className="mt-1 text-2xl font-black text-white">Tip {target.guard_display_name ?? "Guard"}</h1>
        <p className="mt-1 text-xs text-slate-500">{(target?.scan_count ?? 0) || 0} scans · ZAR only</p>
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

      {payBlockedByAuth ? (
        <div className="mb-3 space-y-2" role="status">
          <Skeleton style={{ height: 52, width: "100%", borderRadius: 16 }} />
          <p className="text-center text-xs text-slate-500">
            {!sessionReady ? "Checking your session…" : "Restoring your session…"}
          </p>
        </div>
      ) : null}

      <button
        type="button"
        className={`tap-target min-h-[48px] w-full rounded-2xl bg-gradient-to-r from-amber-400 to-amber-600 py-4 text-lg font-black text-black shadow-lg ${!paying && !payBlockedByAuth ? "fx-glow-pulse" : ""}`}
        disabled={paying || !hasPaystackPublicKey() || payBlockedByAuth}
        onClick={() => void pay()}
      >
        {paying
          ? "Opening checkout…"
          : payBlockedByAuth
            ? !sessionReady
              ? "Checking session…"
              : "Restoring session…"
            : sessionUserId
              ? `Pay ${amountLabel}`
              : sessionGraceElapsed
                ? "Sign in to pay"
                : "Restoring session…"}
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
    <div className="shell mx-auto flex min-h-[100dvh] max-w-md flex-col items-center justify-center gap-4 overflow-x-hidden px-4 py-10 pb-[env(safe-area-inset-bottom)] text-center">
      {children}
    </div>
  );
}

export default function QrTipLanding() {
  const { token } = useParams<{ token: string }>();
  return <QrTipLandingContent key={token ?? "missing"} />;
}

