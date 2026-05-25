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
} from "../lib/edgeFunctionInvoke";

/** Bundle marker for prod grep (edgeFunctionInvoke error parser). */
const __paymentParserBundle = PAYMENT_PARSER_MARKER;
void __paymentParserBundle;
import { openPaystackInline, zarSubunitsFromCents } from "../lib/paystack";
import { getPaystackPublicKey, isPaystackConfigured, paystackEnvIssue } from "../lib/paystackEnv";
import { isSupabaseBrowserConfigured } from "../lib/supabase";
import { isTransientNetworkError } from "../lib/networkUtils";
import { getDeviceFingerprintHash } from "../lib/deviceFingerprint";

/** Prevents double-invoke (double-tap) opening two Paystack sessions. */
let tipCheckoutInFlight = false;
let walletTopUpInFlight = false;

export type PaystackInitResponse = {
  access_code: string;
  authorization_url?: string;
  reference: string;
  email: string;
};

export function hasPaystackPublicKey(): boolean {
  return isPaystackConfigured();
}

export async function initializePaystackTransaction(body: {
  kind: "tip" | "wallet_topup";
  guard_id?: string;
  amount_cents: number;
  qr_code_id?: string;
  source_link_token?: string;
}): Promise<{ data: PaystackInitResponse | null; errorMessage: string | null }> {
  if (!isSupabaseBrowserConfigured) {
    console.error("[TipGuard:pay] Supabase not configured — cannot invoke paystack-initialize", {
      url: edgeFunctionUrl("paystack-initialize"),
    });
    return {
      data: null,
      errorMessage: "Payments backend is not configured (missing VITE_SUPABASE_URL / anon key).",
    };
  }

  const device_fingerprint = await getDeviceFingerprintHash();
  const payload = { ...body, device_fingerprint };
  const started = Date.now();
  logPayInvokeStart("paystack-initialize", payload);

  const attempt = async () =>
    supabase.functions.invoke("paystack-initialize", { body: payload });

  let { data, error } = await attempt();
  for (let i = 0; i < 2 && error && isTransientInvokeError(error.message); i++) {
    await new Promise((r) => setTimeout(r, 350 * (i + 1)));
    ({ data, error } = await attempt());
  }

  if (error) {
    const detail = await parseFunctionsInvokeError(error);
    logPayInvokeFailure("paystack-initialize", detail, Date.now() - started);
    return { data: null, errorMessage: detail.message };
  }

  const responsePayload = data as PaystackInitResponse & { error?: string; code?: string };
  if (responsePayload?.error) {
    const detail = {
      message: responsePayload.error,
      code: responsePayload.code,
      status: 200,
      bodySnippet: JSON.stringify(responsePayload).slice(0, 500),
    };
    logPayInvokeFailure("paystack-initialize", detail, Date.now() - started);
    return { data: null, errorMessage: responsePayload.error };
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

export async function payTipWithPaystack(opts: {
  guardId: string;
  sourceLinkToken?: string;
  amountCents: number;
  navigate: NavigateFunction;
  onError: (msg: string) => void;
  onCheckoutDismissed?: () => void;
  onCheckoutPhase?: (phase: import("../payments/types").CheckoutPhase) => void;
}): Promise<void> {
  console.info("[TipGuard:pay] tip checkout start", {
    guardId: opts.guardId,
    amountCents: opts.amountCents,
    hasLinkToken: Boolean(opts.sourceLinkToken),
    functionsUrl: edgeFunctionUrl("paystack-initialize"),
  });

  if (tipCheckoutInFlight) {
    opts.onError("Checkout already starting. Please wait.");
    return;
  }
  const key = getPaystackPublicKey();
  if (!key) {
    opts.onError(paystackEnvIssue() ?? "Missing VITE_PAYSTACK_PUBLIC_KEY");
    return;
  }
  tipCheckoutInFlight = true;
  setPhase(opts, "initializing");
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user?.email && !user?.id) {
    tipCheckoutInFlight = false;
    setPhase(opts, "idle");
    console.warn("[TipGuard:pay] tip checkout aborted — not signed in");
    opts.onError("Not signed in");
    return;
  }

  const { data, errorMessage } = await initializePaystackTransaction({
    kind: "tip",
    guard_id: opts.guardId,
    amount_cents: opts.amountCents,
    source_link_token: opts.sourceLinkToken,
  });
  if (errorMessage || !data) {
    tipCheckoutInFlight = false;
    setPhase(opts, "idle");
    opts.onError(errorMessage ?? "Could not start checkout");
    return;
  }

  setPhase(opts, "opening_checkout");
  try {
    await openPaystackInline({
      key,
      email: data.email,
      amountSubunits: zarSubunitsFromCents(opts.amountCents),
      currency: "ZAR",
      reference: data.reference,
      accessCode: data.access_code,
      onSuccess: (ref) => {
        tipCheckoutInFlight = false;
        setPhase(opts, "idle");
        opts.navigate(
          `/payment/success?ref=${encodeURIComponent(ref)}&kind=tip&amount_cents=${encodeURIComponent(String(opts.amountCents))}`,
        );
      },
      onClose: () => {
        tipCheckoutInFlight = false;
        setPhase(opts, "idle");
        opts.onCheckoutDismissed?.();
        opts.navigate(`/payment/failure?reason=${encodeURIComponent("cancelled")}&kind=tip`);
      },
    });
  } catch (e) {
    tipCheckoutInFlight = false;
    setPhase(opts, "idle");
    console.error("[TipGuard:pay] Paystack inline failed", e);
    opts.onError((e as Error).message ?? "Paystack failed to open");
  }
}

export async function payWalletTopUpWithPaystack(opts: {
  amountCents: number;
  navigate: NavigateFunction;
  onError: (msg: string) => void;
  onCheckoutDismissed?: () => void;
  onCheckoutPhase?: (phase: CheckoutPhase) => void;
}): Promise<void> {
  console.info("[TipGuard:pay] wallet top-up start", {
    amountCents: opts.amountCents,
    functionsUrl: edgeFunctionUrl("paystack-initialize"),
  });

  if (walletTopUpInFlight) {
    opts.onError("Deposit already starting. Please wait.");
    return;
  }
  const key = getPaystackPublicKey();
  if (!key) {
    opts.onError(paystackEnvIssue() ?? "Missing VITE_PAYSTACK_PUBLIC_KEY");
    return;
  }
  walletTopUpInFlight = true;
  setPhase(opts, "initializing");

  const { data, errorMessage } = await initializePaystackTransaction({
    kind: "wallet_topup",
    amount_cents: opts.amountCents,
  });
  if (errorMessage || !data) {
    walletTopUpInFlight = false;
    setPhase(opts, "idle");
    opts.onError(errorMessage ?? "Could not start deposit");
    return;
  }

  setPhase(opts, "opening_checkout");
  try {
    await openPaystackInline({
      key,
      email: data.email,
      amountSubunits: zarSubunitsFromCents(opts.amountCents),
      currency: "ZAR",
      reference: data.reference,
      accessCode: data.access_code,
      onSuccess: (ref) => {
        walletTopUpInFlight = false;
        setPhase(opts, "idle");
        opts.navigate(`/payment/success?ref=${encodeURIComponent(ref)}&kind=wallet_topup`);
      },
      onClose: () => {
        walletTopUpInFlight = false;
        setPhase(opts, "idle");
        opts.onCheckoutDismissed?.();
        opts.navigate(`/payment/failure?reason=${encodeURIComponent("cancelled")}&kind=wallet_topup`);
      },
    });
  } catch (e) {
    walletTopUpInFlight = false;
    setPhase(opts, "idle");
    console.error("[TipGuard:pay] Paystack inline failed", e);
    opts.onError((e as Error).message ?? "Paystack failed to open");
  }
}
