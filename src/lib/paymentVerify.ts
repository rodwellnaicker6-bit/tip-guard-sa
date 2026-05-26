import {
  logPayInvokeFailure,
  logPayInvokeStart,
  logPayInvokeSuccess,
  parseFunctionsInvokeError,
} from "./edgeFunctionInvoke";
import { ensurePaymentAccessToken } from "./paymentSession";
import { supabase } from "./supabase";

export type VerifyPaymentResult = {
  reference: string;
  paystack_status: string;
  verified: boolean;
  tip_status: string | null;
  transaction_status: string | null;
  amount_cents: number | null;
};

/** Client-side Paystack verify via Edge Function (poll after redirect). */
export async function verifyPaystackReference(
  reference: string,
): Promise<{ data: VerifyPaymentResult | null; error: string | null }> {
  const session = await ensurePaymentAccessToken();
  if (!session.ok) {
    return { data: null, error: session.message };
  }

  const started = Date.now();
  logPayInvokeStart("paystack-verify", { reference });
  const { data, error } = await supabase.functions.invoke("paystack-verify", {
    body: { reference },
    headers: { Authorization: `Bearer ${session.accessToken}` },
  });
  if (error) {
    const detail = await parseFunctionsInvokeError(error);
    logPayInvokeFailure("paystack-verify", detail, Date.now() - started);
    return { data: null, error: detail.message };
  }
  logPayInvokeSuccess("paystack-verify", Date.now() - started);
  const payload = data as VerifyPaymentResult & { error?: string };
  if (payload?.error) return { data: null, error: payload.error };
  return { data: payload, error: null };
}
