import {
  logPayInvokeFailure,
  logPayInvokeStart,
  logPayInvokeSuccess,
  parseFunctionsInvokeError,
} from "./edgeFunctionInvoke";
import { PAYMENT_VERIFY_TIMEOUT_MS, withOperationTimeout } from "./operationTimeout";
import { perfLog } from "./perfLog";
import { ensurePaymentAccessToken } from "./paymentSession";
import { supabase } from "./supabase";

export type VerifyPaymentResult = {
  reference: string;
  paystack_status: string;
  verified: boolean;
  tip_status: string | null;
  transaction_status: string | null;
  amount_cents: number | null;
  tip_amount_cents?: number | null;
  platform_fee_cents?: number | null;
  charge_amount_cents?: number | null;
};

async function invokePaymentStatus(
  reference: string,
  accessToken?: string,
): Promise<{
  data: VerifyPaymentResult | null;
  error: string | null;
}> {
  const started = Date.now();
  logPayInvokeStart("payment-status", { reference });
  const headers = accessToken ? { Authorization: `Bearer ${accessToken}` } : undefined;
  try {
    const { data, error } = await withOperationTimeout(
      "pay",
      "payment-status invoke",
      supabase.functions.invoke("payment-status", { body: { reference }, headers }),
      PAYMENT_VERIFY_TIMEOUT_MS,
    );
    if (error) {
      const detail = await parseFunctionsInvokeError(error);
      logPayInvokeFailure("payment-status", detail, Date.now() - started);
      return { data: null, error: detail.message };
    }
    logPayInvokeSuccess("payment-status", Date.now() - started);
    const payload = data as VerifyPaymentResult & { error?: string };
    if (payload?.error) return { data: null, error: payload.error };
    return { data: payload, error: null };
  } catch {
    const ms = Date.now() - started;
    perfLog("payment-status timeout", ms);
    logPayInvokeFailure("payment-status", { message: "Status check timed out" }, ms);
    return { data: null, error: "Status check timed out" };
  }
}

/** Client-side Paystack verify via Edge Function (poll after redirect). */
export async function verifyPaystackReference(
  reference: string,
): Promise<{ data: VerifyPaymentResult | null; error: string | null }> {
  const session = await ensurePaymentAccessToken();
  if (session.ok) {
    const started = Date.now();
    logPayInvokeStart("paystack-verify", { reference });
    try {
      const result = await withOperationTimeout(
        "pay",
        "paystack-verify invoke",
        supabase.functions.invoke("paystack-verify", {
          body: { reference },
          headers: { Authorization: `Bearer ${session.accessToken}` },
        }),
        PAYMENT_VERIFY_TIMEOUT_MS,
      );
      if (!result.error) {
        logPayInvokeSuccess("paystack-verify", Date.now() - started);
        const payload = result.data as VerifyPaymentResult & { error?: string };
        if (!payload?.error) return { data: payload, error: null };
      }
    } catch {
      perfLog("paystack-verify timeout", Date.now() - started);
    }
  }

  return invokePaymentStatus(reference, session.ok ? session.accessToken : undefined);
}

/** Poll payment status (session optional — uses payment-status when unauthenticated). */
export async function pollPaymentReference(
  reference: string,
): Promise<{ data: VerifyPaymentResult | null; error: string | null }> {
  return verifyPaystackReference(reference);
}
