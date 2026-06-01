import type { NavigateFunction } from "react-router-dom";
import type { CheckoutPhase } from "../payments/types";
import { supabase } from "../lib/supabase";
import { PAYMENT_PARSER_MARKER } from "../lib/buildInfo";
import {
  edgeFunctionUrl,
  logPayInvokeFailure,
  logPayInvokeStart,
  logPayInvokeSuccess,
  parseFunctionsInvokeError,
  type InvokeErrorDetail,
} from "../lib/edgeFunctionInvoke";
import { recordError } from "../lib/errorTelemetry";

/** Bundle marker for prod grep (edgeFunctionInvoke error parser). */
const __paymentParserBundle = PAYMENT_PARSER_MARKER;
void __paymentParserBundle;
import { openPaystackInline, zarSubunitsFromCents } from "../lib/paystack";
import { getPaystackPublicKey, isPaystackConfigured, paystackEnvIssue } from "../lib/paystackEnv";
import { isSupabaseBrowserConfigured } from "../lib/supabase";
import { isTransientNetworkError } from "../lib/networkUtils";
import { getDeviceFingerprintHash } from "../lib/deviceFingerprint";
import { PAYMENT_INIT_TIMEOUT_MS, logFlow, withOperationTimeout } from "../lib/operationTimeout";
import {
  confirmRequiresSignInForPayment,
  logQrAuth,
  qrAuthTimestamp,
  waitForStableSession,
} from "../lib/qrAuthSession";
import { ensurePaymentAccessToken, hintFastPath, type PaymentSessionHint } from "../lib/paymentSession";

/** Prevents double-invoke (double-tap) opening two Paystack sessions. */
let tipCheckoutInFlight = false;
let tipCheckoutStartedAt = 0;
let walletTopUpInFlight = false;
let walletTopUpStartedAt = 0;

/** Max age before a checkout lock is treated as stale and auto-cleared. */
const CHECKOUT_LOCK_STALE_MS = 60_000;

/** Clears a stuck module-level checkout lock (unmount, cancel, failed init). */
export function releaseTipCheckoutLock(): void {
  tipCheckoutInFlight = false;
  tipCheckoutStartedAt = 0;
}

export function releaseWalletTopUpLock(): void {
  walletTopUpInFlight = false;
  walletTopUpStartedAt = 0;
}

function tipCheckoutLockIsStale(): boolean {
  return tipCheckoutInFlight && Date.now() - tipCheckoutStartedAt > CHECKOUT_LOCK_STALE_MS;
}

function walletTopUpLockIsStale(): boolean {
  return walletTopUpInFlight && Date.now() - walletTopUpStartedAt > CHECKOUT_LOCK_STALE_MS;
}

function acquireTipCheckoutLock(): boolean {
  if (tipCheckoutInFlight && !tipCheckoutLockIsStale()) return false;
  if (tipCheckoutInFlight) {
    console.warn("[TipGuard:pay] clearing stale tip checkout lock");
    releaseTipCheckoutLock();
  }
  tipCheckoutInFlight = true;
  tipCheckoutStartedAt = Date.now();
  return true;
}

function acquireWalletTopUpLock(): boolean {
  if (walletTopUpInFlight && !walletTopUpLockIsStale()) return false;
  if (walletTopUpInFlight) {
    console.warn("[TipGuard:pay] clearing stale wallet top-up lock");
    releaseWalletTopUpLock();
  }
  walletTopUpInFlight = true;
  walletTopUpStartedAt = Date.now();
  return true;
}

function scheduleCheckoutLockWatchdog(
  isLocked: () => boolean,
  isStale: () => boolean,
  release: () => void,
  opts: { onCheckoutPhase?: (p: CheckoutPhase) => void; onCheckoutDismissed?: () => void },
): void {
  window.setTimeout(() => {
    if (!isLocked() || !isStale()) return;
    console.warn("[TipGuard:pay] checkout lock watchdog — releasing stale lock");
    release();
    setPhase(opts, "idle");
    opts.onCheckoutDismissed?.();
  }, CHECKOUT_LOCK_STALE_MS + 500);
}

export type PaystackInitResponse = {
  access_code: string;
  authorization_url?: string;
  reference: string;
  email: string;
};

export type PaystackInitResult = {
  data: PaystackInitResponse | null;
  errorMessage: string | null;
  /** Session or edge rejected the JWT — redirect to login when handler is wired */
  requiresSignIn?: boolean;
};

function invokeSuggestsSignIn(detail: InvokeErrorDetail): boolean {
  if (detail.code === "session_replay" || detail.code === "duplicate_pending") return false;
  const st = detail.status;
  if (st === 401 || st === 403) return true;
  const m = (detail.message ?? "").toLowerCase();
  if (m.includes("jwt") && (m.includes("expired") || m.includes("invalid"))) return true;
  if (m.includes("not authorized") || m.includes("unauthorized")) return true;
  return false;
}

function formatPayInitError(detail: InvokeErrorDetail): string {
  if (detail.code === "session_replay") {
    return "This tip link was already used for checkout. Scan a fresh QR or open a new link.";
  }
  if (detail.code === "duplicate_pending") {
    return detail.message;
  }
  return detail.message;
}

function toPaymentHint(opts: {
  payerUserId?: string | null;
  payerAccessToken?: string | null;
  sessionPrechecked?: boolean;
}): PaymentSessionHint {
  return {
    userId: opts.payerUserId,
    accessToken: opts.payerAccessToken,
    sessionPrechecked: opts.sessionPrechecked,
  };
}

export function hasPaystackPublicKey(): boolean {
  return isPaystackConfigured();
}

export async function initializePaystackTransaction(
  body: {
    kind: "tip" | "wallet_topup";
    guard_id?: string;
    amount_cents: number;
    qr_code_id?: string;
    source_link_token?: string;
  },
  paymentHint?: PaymentSessionHint,
): Promise<PaystackInitResult> {
  if (!isSupabaseBrowserConfigured) {
    console.error("[TipGuard:pay] Supabase not configured — cannot invoke paystack-initialize", {
      url: edgeFunctionUrl("paystack-initialize"),
    });
    return {
      data: null,
      errorMessage: "Payments backend is not configured (missing VITE_SUPABASE_URL / anon key).",
    };
  }

  let accessToken: string;
  let userId: string;
  const fast = hintFastPath(paymentHint);
  if (fast?.ok) {
    accessToken = fast.accessToken;
    userId = fast.userId;
    logQrAuth("initializePaystackTransaction using prechecked JWT (no refresh)", {
      userId,
      t: qrAuthTimestamp(),
    });
  } else {
    if (!paymentHint?.sessionPrechecked) {
      const stable = await waitForStableSession({
        forPayment: true,
        reactUserId: paymentHint?.userId,
      });
      logQrAuth("initializePaystackTransaction after stable session", {
        ok: stable.ok,
        reason: stable.ok ? undefined : stable.reason,
        waitedMs: stable.waitedMs,
        t: qrAuthTimestamp(),
      });
      if (!stable.ok && stable.reason === "session_not_ready") {
        return {
          data: null,
          errorMessage: "Restoring your session — wait a moment and try again.",
        };
      }
    } else {
      logQrAuth("initializePaystackTransaction prechecked but no fast path JWT", {
        hasUserId: Boolean(paymentHint?.userId),
        hasToken: Boolean(paymentHint?.accessToken),
        t: qrAuthTimestamp(),
      });
    }

    const session = await ensurePaymentAccessToken(paymentHint);
    if (!session.ok) {
      const requiresSignIn = session.code === "not_signed_in" || session.code === "session_expired";
      return { data: null, errorMessage: session.message, requiresSignIn };
    }
    accessToken = session.accessToken;
    userId = session.userId;
  }

  const device_fingerprint = await getDeviceFingerprintHash();
  const payload = { ...body, device_fingerprint };
  const started = Date.now();
  logPayInvokeStart("paystack-initialize", payload);

  const anonKey = import.meta.env.VITE_SUPABASE_ANON_KEY?.trim() ?? "";
  const invokeHeaders: Record<string, string> = {
    Authorization: `Bearer ${accessToken}`,
  };
  if (anonKey) invokeHeaders.apikey = anonKey;
  const attempt = async () =>
    supabase.functions.invoke("paystack-initialize", { body: payload, headers: invokeHeaders });

  let { data, error } = await withOperationTimeout("pay", "paystack-initialize invoke", attempt(), PAYMENT_INIT_TIMEOUT_MS);
  for (let i = 0; i < 2 && error && isTransientInvokeError(error.message); i++) {
    await new Promise((r) => setTimeout(r, 350 * (i + 1)));
    ({ data, error } = await withOperationTimeout(
      "pay",
      `paystack-initialize retry ${i + 1}`,
      attempt(),
      PAYMENT_INIT_TIMEOUT_MS,
    ));
  }

  if (error) {
    const detail = await parseFunctionsInvokeError(error);
    logPayInvokeFailure("paystack-initialize", detail, Date.now() - started);
    const requiresSignIn = invokeSuggestsSignIn(detail);
    return { data: null, errorMessage: formatPayInitError(detail), requiresSignIn };
  }

  const responsePayload = data as PaystackInitResponse & { error?: string; code?: string };
  if (responsePayload?.error) {
    const detail: InvokeErrorDetail = {
      message: responsePayload.error,
      code: responsePayload.code,
      status: 200,
      bodySnippet: JSON.stringify(responsePayload).slice(0, 500),
    };
    logPayInvokeFailure("paystack-initialize", detail, Date.now() - started);
    const requiresSignIn = invokeSuggestsSignIn(detail);
    return { data: null, errorMessage: formatPayInitError(detail), requiresSignIn };
  }
  if (!responsePayload?.access_code || !responsePayload?.reference) {
    logPayInvokeFailure(
      "paystack-initialize",
      { message: "Invalid response from pay server", bodySnippet: JSON.stringify(data).slice(0, 500) },
      Date.now() - started,
    );
    return { data: null, errorMessage: "Invalid response from pay server" };
  }

  logPayInvokeSuccess("paystack-initialize", Date.now() - started);
  return { data: responsePayload, errorMessage: null };
}

function isTransientInvokeError(msg: string): boolean {
  return isTransientNetworkError(msg);
}

function setPhase(opts: { onCheckoutPhase?: (p: CheckoutPhase) => void }, phase: CheckoutPhase) {
  opts.onCheckoutPhase?.(phase);
}

async function resolvePaystackInit(
  body: Parameters<typeof initializePaystackTransaction>[0],
  hint: PaymentSessionHint,
): Promise<PaystackInitResult> {
  let result = await initializePaystackTransaction(body, hint);
  if (!result.requiresSignIn) return result;

  for (let attempt = 0; attempt < 2; attempt++) {
    logQrAuth("paystack init requiresSignIn — retry with live session", {
      attempt,
      t: qrAuthTimestamp(),
    });
    await new Promise((r) => setTimeout(r, 350 * (attempt + 1)));
    const { data: { session: live } } = await supabase.auth.getSession();
    if (!live?.access_token || !live?.user?.id) break;
    result = await initializePaystackTransaction(body, {
      userId: live.user.id,
      accessToken: live.access_token,
      sessionPrechecked: true,
    });
    if (!result.requiresSignIn) return result;
  }
  return result;
}

export async function payTipWithPaystack(opts: {
  guardId: string;
  sourceLinkToken?: string;
  amountCents: number;
  navigate: NavigateFunction;
  onError: (msg: string) => void;
  onCheckoutDismissed?: () => void;
  onCheckoutPhase?: (phase: import("../payments/types").CheckoutPhase) => void;
  /** When session/JWT is rejected — e.g. redirect to login with return path */
  onRequiresAuth?: () => void;
  payerUserId?: string | null;
  payerAccessToken?: string | null;
  sessionPrechecked?: boolean;
}): Promise<void> {
  if (!opts.guardId?.trim()) {
    opts.onError("Tip target is missing. Reload the page and try again.");
    return;
  }
  if (!Number.isFinite(opts.amountCents) || opts.amountCents < 100) {
    opts.onError("Choose a valid tip amount.");
    return;
  }

  console.info("[TipGuard:pay] tip checkout start", {
    guardId: opts.guardId,
    amountCents: opts.amountCents,
    hasLinkToken: Boolean(opts.sourceLinkToken),
    functionsUrl: edgeFunctionUrl("paystack-initialize"),
    t: qrAuthTimestamp(),
  });

  const paymentHint: PaymentSessionHint = toPaymentHint(opts);
  if (!paymentHint.accessToken || !paymentHint.userId) {
    const { data: { session: live } } = await supabase.auth.getSession();
    if (live?.access_token && live?.user?.id) {
      paymentHint.userId = live.user.id;
      paymentHint.accessToken = live.access_token;
      logQrAuth("payTip hydrated JWT from getSession", { userId: live.user.id });
    }
  }

  if (!opts.sessionPrechecked) {
    const stable = await waitForStableSession({
      forPayment: true,
      reactUserId: opts.payerUserId,
    });
    logQrAuth("payTipWithPaystack after stable session", {
      ok: stable.ok,
      reason: stable.ok ? undefined : stable.reason,
      waitedMs: stable.waitedMs,
    });
    if (!stable.ok) {
      if (stable.reason === "not_signed_in" || stable.reason === "timeout") {
        const signedOut = await confirmRequiresSignInForPayment({
          knownUserId: opts.payerUserId,
          knownAccessToken: opts.payerAccessToken,
        });
        if (signedOut) {
          if (opts.onRequiresAuth) opts.onRequiresAuth();
          else opts.onError("Please sign in to continue.");
          return;
        }
      }
      opts.onError("Restoring your session — wait a moment and tap Pay again.");
      return;
    }
    paymentHint.userId = stable.userId;
    paymentHint.sessionPrechecked = true;
  } else {
    logQrAuth("payTipWithPaystack skip stable wait (prechecked)", {
      userId: opts.payerUserId ?? null,
    });
  }

  if (!acquireTipCheckoutLock()) {
    opts.onError("Checkout already starting. Please wait.");
    return;
  }
  const key = getPaystackPublicKey();
  if (!key) {
    releaseTipCheckoutLock();
    opts.onError(paystackEnvIssue() ?? "Missing VITE_PAYSTACK_PUBLIC_KEY");
    return;
  }

  let paystackModalOpen = false;
  try {
    setPhase(opts, "initializing");
    logFlow("pay", "tip checkout initializing");

    const initBody = {
      kind: "tip" as const,
      guard_id: opts.guardId,
      amount_cents: opts.amountCents,
      source_link_token: opts.sourceLinkToken,
    };
    const { data, errorMessage, requiresSignIn } = await resolvePaystackInit(initBody, paymentHint);
    if (requiresSignIn) {
      releaseTipCheckoutLock();
      setPhase(opts, "idle");
      if (hintFastPath(paymentHint)?.ok) {
        logQrAuth("payTip requiresSignIn ignored — prechecked JWT still present", {});
        opts.onError("Could not start checkout. Tap Pay again.");
        return;
      }
      const signedOut = await confirmRequiresSignInForPayment({
        knownUserId: opts.payerUserId,
        knownAccessToken: opts.payerAccessToken,
      });
      if (!signedOut) {
        logQrAuth("payTip requiresSignIn after retry — still has session", {
          hasLinkToken: Boolean(opts.sourceLinkToken),
        });
        opts.onError("Could not start checkout. Tap Pay again.");
        return;
      }
      logQrAuth("payTip requiresSignIn confirmed — invoking onRequiresAuth", {});
      if (opts.onRequiresAuth) opts.onRequiresAuth();
      else opts.onError(errorMessage ?? "Please sign in to continue.");
      return;
    }
    if (errorMessage || !data) {
      recordError("pay_tip_init", errorMessage ?? "unknown", { code: "paystack_init" });
      opts.onError(errorMessage ?? "Could not start checkout");
      return;
    }

    setPhase(opts, "opening_checkout");
    const opened = await openPaystackInline({
      key,
      email: data.email,
      amountSubunits: zarSubunitsFromCents(opts.amountCents),
      currency: "ZAR",
      reference: data.reference,
      accessCode: data.access_code,
      onSuccess: (ref) => {
        releaseTipCheckoutLock();
        setPhase(opts, "idle");
        opts.navigate(
          `/payment/success?ref=${encodeURIComponent(ref)}&kind=tip&amount_cents=${encodeURIComponent(String(opts.amountCents))}`,
        );
      },
      onClose: () => {
        releaseTipCheckoutLock();
        setPhase(opts, "idle");
        opts.onCheckoutDismissed?.();
        opts.navigate(`/payment/failure?reason=${encodeURIComponent("cancelled")}&kind=tip`);
      },
    });
    if (!opened.ok) {
      recordError("pay_tip_inline", opened.message, { code: "paystack_pop" });
      opts.onError(opened.message);
      return;
    }
    paystackModalOpen = true;
    scheduleCheckoutLockWatchdog(() => tipCheckoutInFlight, tipCheckoutLockIsStale, releaseTipCheckoutLock, opts);
  } catch (e) {
    console.error("[TipGuard:pay] tip checkout failed", e);
    recordError("pay_tip_checkout", e instanceof Error ? e.message : String(e), { code: "exception" });
    opts.onError(e instanceof Error ? e.message : "Could not start checkout");
  } finally {
    if (!paystackModalOpen) {
      releaseTipCheckoutLock();
      setPhase(opts, "idle");
    }
  }
}

export async function payWalletTopUpWithPaystack(opts: {
  amountCents: number;
  navigate: NavigateFunction;
  onError: (msg: string) => void;
  onCheckoutDismissed?: () => void;
  onCheckoutPhase?: (phase: CheckoutPhase) => void;
  onRequiresAuth?: () => void;
  payerUserId?: string | null;
  payerAccessToken?: string | null;
  sessionPrechecked?: boolean;
}): Promise<void> {
  console.info("[TipGuard:pay] wallet top-up start", {
    amountCents: opts.amountCents,
    functionsUrl: edgeFunctionUrl("paystack-initialize"),
  });

  const paymentHint: PaymentSessionHint = toPaymentHint(opts);
  if (!opts.sessionPrechecked) {
    const stable = await waitForStableSession({ forPayment: true, reactUserId: opts.payerUserId });
    if (!stable.ok && stable.reason !== "not_signed_in") {
      opts.onError("Restoring your session — wait a moment and try again.");
      return;
    }
    if (stable.ok) {
      paymentHint.userId = stable.userId;
      paymentHint.sessionPrechecked = true;
    }
  }

  if (!acquireWalletTopUpLock()) {
    opts.onError("Deposit already starting. Please wait.");
    return;
  }
  const key = getPaystackPublicKey();
  if (!key) {
    releaseWalletTopUpLock();
    opts.onError(paystackEnvIssue() ?? "Missing VITE_PAYSTACK_PUBLIC_KEY");
    return;
  }

  let paystackModalOpen = false;
  try {
    setPhase(opts, "initializing");

    const { data, errorMessage, requiresSignIn } = await resolvePaystackInit(
      { kind: "wallet_topup", amount_cents: opts.amountCents },
      paymentHint,
    );
    if (requiresSignIn) {
      releaseWalletTopUpLock();
      setPhase(opts, "idle");
      if (hintFastPath(paymentHint)?.ok) {
        opts.onError("Could not start deposit. Try again.");
        return;
      }
      const signedOut = await confirmRequiresSignInForPayment({
        knownUserId: opts.payerUserId,
        knownAccessToken: opts.payerAccessToken,
      });
      if (!signedOut) {
        logQrAuth("walletTopUp requiresSignIn after retry — still has session", {});
        opts.onError("Could not start deposit. Try again.");
        return;
      }
      if (opts.onRequiresAuth) opts.onRequiresAuth();
      else opts.onError(errorMessage ?? "Please sign in to continue.");
      return;
    }
    if (errorMessage || !data) {
      recordError("pay_wallet_init", errorMessage ?? "unknown", { code: "paystack_init" });
      opts.onError(errorMessage ?? "Could not start deposit");
      return;
    }

    setPhase(opts, "opening_checkout");
    const opened = await openPaystackInline({
      key,
      email: data.email,
      amountSubunits: zarSubunitsFromCents(opts.amountCents),
      currency: "ZAR",
      reference: data.reference,
      accessCode: data.access_code,
      onSuccess: (ref) => {
        releaseWalletTopUpLock();
        setPhase(opts, "idle");
        opts.navigate(`/payment/success?ref=${encodeURIComponent(ref)}&kind=wallet_topup`);
      },
      onClose: () => {
        releaseWalletTopUpLock();
        setPhase(opts, "idle");
        opts.onCheckoutDismissed?.();
        opts.navigate(`/payment/failure?reason=${encodeURIComponent("cancelled")}&kind=wallet_topup`);
      },
    });
    if (!opened.ok) {
      recordError("pay_wallet_inline", opened.message, { code: "paystack_pop" });
      opts.onError(opened.message);
      return;
    }
    paystackModalOpen = true;
    scheduleCheckoutLockWatchdog(() => walletTopUpInFlight, walletTopUpLockIsStale, releaseWalletTopUpLock, opts);
  } catch (e) {
    console.error("[TipGuard:pay] wallet top-up failed", e);
    recordError("pay_wallet_checkout", e instanceof Error ? e.message : String(e), { code: "exception" });
    opts.onError(e instanceof Error ? e.message : "Could not start deposit");
  } finally {
    if (!paystackModalOpen) {
      releaseWalletTopUpLock();
      setPhase(opts, "idle");
    }
  }
}
