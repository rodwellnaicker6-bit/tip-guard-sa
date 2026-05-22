import type { NavigateFunction } from "react-router-dom";
import type { CheckoutPhase } from "../payments/types";
import { supabase } from "../lib/supabase";
import { openPaystackInline, zarSubunitsFromCents } from "../lib/paystack";
import { getPaystackPublicKey, isPaystackConfigured, paystackEnvIssue } from "../lib/paystackEnv";
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
}): Promise<{ data: PaystackInitResponse | null; errorMessage: string | null }> {
  const device_fingerprint = await getDeviceFingerprintHash();
  const attempt = async () =>
    supabase.functions.invoke("paystack-initialize", { body: { ...body, device_fingerprint } });
  let { data, error } = await attempt();
  for (let i = 0; i < 2 && error && isTransientInvokeError(error.message); i++) {
    await new Promise((r) => setTimeout(r, 350 * (i + 1)));
    ({ data, error } = await attempt());
  }
  if (error) {
    return { data: null, errorMessage: error.message };
  }
  const payload = data as PaystackInitResponse & { error?: string; code?: string };
  if (payload?.error) {
    return { data: null, errorMessage: payload.error };
  }
  if (!payload?.access_code || !payload?.reference) {
    return { data: null, errorMessage: "Invalid response from pay server" };
  }
  return { data: payload, errorMessage: null };
}

function isTransientInvokeError(msg: string): boolean {
  return isTransientNetworkError(msg);
}

function setPhase(opts: { onCheckoutPhase?: (p: CheckoutPhase) => void }, phase: CheckoutPhase) {
  opts.onCheckoutPhase?.(phase);
}

export async function payTipWithPaystack(opts: {
  guardId: string;
  amountCents: number;
  navigate: NavigateFunction;
  onError: (msg: string) => void;
  onCheckoutDismissed?: () => void;
  onCheckoutPhase?: (phase: import("../payments/types").CheckoutPhase) => void;
}): Promise<void> {
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
    opts.onError("Not signed in");
    return;
  }

  const { data, errorMessage } = await initializePaystackTransaction({
    kind: "tip",
    guard_id: opts.guardId,
    amount_cents: opts.amountCents,
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
    opts.onError((e as Error).message ?? "Paystack failed to open");
  }
}
