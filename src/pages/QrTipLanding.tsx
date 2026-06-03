import { useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { Link, useNavigate, useParams, useSearchParams } from "react-router-dom";
import { centsFromRandInput, zarFromCents } from "../lib/money";
import { calcAdditivePlatformFee } from "../lib/platformFee";
import { useAuth } from "../context/useAuth";
import { startTipCheckout } from "../payments/checkoutFlow";
import { releaseTipCheckoutLock } from "../services/paystackCore";
import { hasPaystackPublicKey } from "../services/paymentService";
import {
  clearResolveCacheForToken,
  getLastResolveDebug,
  peekCachedResolve,
  readCachedTipDisplayName,
  resolveTipTarget,
  type ResolveTipTargetDebug,
} from "../lib/resolveTipTarget";
import {
  QR_AUTH_GRACE_MS,
  confirmRequiresSignInForPayment,
  isSessionRestoreInFlight,
  logQrAuth,
  qrAuthTimestamp,
  resolvePaymentUserId,
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
import { supabase } from "../lib/supabase";
import { stashAuthRedirectPath } from "../lib/loginRedirect";
import { ensureTipPayerSession } from "../lib/tipPayerSession";
import { useGuestTipPayer } from "../hooks/useGuestTipPayer";
import { isQrResolveUserMessage, qrResolveErrorMessage } from "../lib/userFacingErrors";

const PRESETS = [10, 20, 50] as const;

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
  const { payerUserId, payerReady, guestLoading, guestFailed, ensureGuest } = useGuestTipPayer({
    sessionReady,
    sessionUserId,
    session,
  });
  const sessionMissing = sessionReady && !payerUserId;
  const sessionGraceElapsed = useGracePeriod(sessionMissing, QR_AUTH_GRACE_MS);
  const [, setAuthSessionTick] = useState(0);
  useEffect(() => subscribeQrAuthSession(() => setAuthSessionTick((n) => n + 1)), []);
  const sessionRestoreInFlight = isSessionRestoreInFlight(
    sessionReady,
    sessionMissing,
    sessionGraceElapsed,
  );
  const payBlockedByAuth =
    sessionRestoreInFlight || (guestLoading && !payerReady) || (!payerReady && !sessionGraceElapsed && !guestFailed);
  const [target, setTarget] = useState<Awaited<ReturnType<typeof resolveTipTarget>>["target"]>(() =>
    initialTipState(token).target,
  );
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(() => initialTipState(token).loading);
  const [amount, setAmount] = useState("20");
  const [paying, setPaying] = useState(false);
  const [checkoutPhase, setCheckoutPhase] = useState<CheckoutPhase>("idle");
  const [reload, setReload] = useState(0);
  const [resolveDebug, setResolveDebug] = useState<ResolveTipTargetDebug | null>(null);
  const resolveDebugUi = searchParams.get("tg_resolve_debug") === "1";
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
  const feePreview = useMemo(() => {
    if (cents == null || cents < 100) return null;
    return calcAdditivePlatformFee(cents);
  }, [cents]);

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
      const { target: resolved, error: resolveErr, debug } = await resolveTipTarget(token);
      if (cancelled) return;
      setResolveDebug(debug ?? getLastResolveDebug());
      if (resolveErr || !resolved) {
        const raw = resolveErr ?? "";
        setError(isQrResolveUserMessage(raw) ? raw : qrResolveErrorMessage(raw, debug?.reason));
        setTarget(null);
      } else {
        setError(null);
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
    if (!payerReady) {
      const ok = await ensureGuest();
      if (!ok) {
        setError(
          guestFailed
            ? "Guest checkout is unavailable. Enable anonymous sign-in in Supabase or try again."
            : "Preparing secure checkout — wait a moment and tap Pay again.",
        );
        return;
      }
    }
    if (payBlockedByAuth) {
      logQrAuth("pay blocked — session restore in flight", {
        sessionReady,
        sessionRestoreInFlight,
      });
      setError("Preparing secure checkout — wait a moment and tap Pay again.");
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
      const signedOut = await confirmRequiresSignInForPayment({
        knownUserId: user?.id ?? session?.user?.id,
        knownAccessToken: session?.access_token,
      });
      if (!signedOut) {
        logQrAuth("pay continuing — session recovered after stable wait", { waitedMs: stable.waitedMs });
      } else {
        const guest = await ensureTipPayerSession(session);
        if (guest) {
          logQrAuth("pay using anonymous guest session", { uid: guest.userId });
          // Resolved below via getSession after anonymous sign-in.
        } else {
          logAuth("QR pay redirect to login (confirmed sign-out)", { token });
          logQrAuth("redirect /login after confirmed sign-out", { token });
          stashAuthRedirectPath(`/tip/${token}?amount=${encodeURIComponent(amount)}`);
          navigate("/login", { replace: true });
          return;
        }
      }
    }
    let resolvedPayerId = stable.ok ? stable.userId : payerUserId ?? null;
    let payerAccessToken: string | null = stable.ok ? session?.access_token ?? null : null;
    if (!resolvedPayerId) {
      resolvedPayerId = (await resolvePaymentUserId(user?.id, session?.user?.id)) ?? payerUserId;
    }
    if (!resolvedPayerId || !payerAccessToken) {
      const { data: { session: live } } = await supabase.auth.getSession();
      if (live?.user?.id) resolvedPayerId = live.user.id;
      if (live?.access_token) payerAccessToken = live.access_token;
    }
    if (!resolvedPayerId || !payerAccessToken) {
      const guest = await ensureTipPayerSession(session);
      if (guest) {
        resolvedPayerId = guest.userId;
        payerAccessToken = guest.accessToken;
        logQrAuth("pay using guest session after resolve", { uid: resolvedPayerId });
      }
    }
    if (!resolvedPayerId || !payerAccessToken) {
      setError("Could not start checkout. Check your connection and try again.");
      return;
    }
    if (!user?.id) {
      logAuth("QR pay using recovered session (React user was briefly null)", { payerUserId: resolvedPayerId });
      logQrAuth("pay using recovered session id", { payerUserId: resolvedPayerId, waitedMs: stable.waitedMs });
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
        payerUserId: resolvedPayerId,
        payerAccessToken,
        sessionPrechecked: true,
        navigate,
        onRequiresAuth: () => {
          void (async () => {
            releaseTipCheckoutLock();
            const { data: { session: live } } = await supabase.auth.getSession();
            if (live?.user?.id && live?.access_token) {
              logQrAuth("onRequiresAuth ignored — live getSession has user", { uid: live.user.id });
              setError("Could not start checkout. Tap Pay again.");
              return;
            }
            const guest = await ensureTipPayerSession(live);
            if (guest) {
              logQrAuth("onRequiresAuth recovered via guest session", { uid: guest.userId });
              setError("Could not start checkout. Tap Pay again.");
              return;
            }
            if (!(await confirmRequiresSignInForPayment({ knownUserId: resolvedPayerId, knownAccessToken: payerAccessToken }))) {
              logQrAuth("onRequiresAuth ignored — session still present", {});
              setError("Could not start checkout. Tap Pay again.");
              return;
            }
            logQrAuth("onRequiresAuth → /login", { token });
            stashAuthRedirectPath(`/tip/${token}?amount=${encodeURIComponent(amount)}`);
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
          onRetry={() => {
            if (token) clearResolveCacheForToken(token);
            setResolveDebug(null);
            setError(null);
            setLoading(true);
            setReload((n) => n + 1);
          }}
        />
        {token ? (
          <p className="mt-2 font-mono text-[10px] text-slate-500">
            Link code: <span className="text-slate-400">{token}</span>
            {resolveDebugUi && resolveDebug ? (
              <span className="mt-1 block text-left text-slate-400">
                debug · rows={resolveDebug.rowCount} · rpcOk={String(resolveDebug.rpcOk)}
                {resolveDebug.reason ? ` · ${resolveDebug.reason}` : ""}
                {resolveDebug.rpcErrorCode ? ` · ${resolveDebug.rpcErrorCode}` : ""}
                {resolveDebug.guardId ? ` · guard=${resolveDebug.guardId.slice(0, 8)}…` : ""}
              </span>
            ) : null}
          </p>
        ) : null}
        <p className="mt-2 text-xs text-slate-500">
          Check the code is current, the guard is verified, and your venue has finished setup.
          {resolveDebugUi ? null : (
            <>
              {" "}
              Add <span className="font-mono">?tg_resolve_debug=1</span> for field diagnostics.
            </>
          )}
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
        {feePreview && feePreview.platformFeeCents > 0 ? (
          <p className="mt-2 text-center text-sm text-slate-400">
            Platform Fee (2%): {zarFromCents(feePreview.platformFeeCents)} · Total charged{" "}
            <span className="font-semibold text-amber-300">{zarFromCents(feePreview.chargeAmountCents)}</span>
          </p>
        ) : null}
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
            {!sessionReady ? "Checking your session…" : "Preparing secure checkout…"}
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
            ? guestLoading || !sessionReady
              ? "Preparing checkout…"
              : "Preparing checkout…"
            : payerReady
              ? feePreview && feePreview.platformFeeCents > 0
                ? `Pay ${zarFromCents(feePreview.chargeAmountCents)}`
                : `Pay ${amountLabel}`
              : guestFailed
                ? "Checkout unavailable"
                : "Preparing checkout…"}
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

