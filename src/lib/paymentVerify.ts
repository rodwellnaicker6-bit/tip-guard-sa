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
  const { data, error } = await supabase.functions.invoke("paystack-verify", {
    body: { reference },
  });
  if (error) return { data: null, error: error.message };
  const payload = data as VerifyPaymentResult & { error?: string };
  if (payload?.error) return { data: null, error: payload.error };
  return { data: payload, error: null };
}
