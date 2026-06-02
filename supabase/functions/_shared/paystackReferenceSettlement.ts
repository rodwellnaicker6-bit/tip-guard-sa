import type { SupabaseClient } from "https://esm.sh/@supabase/supabase-js@2.49.1";

export type PaystackSettlementResult = {
  reference: string;
  paystack_status: string;
  verified: boolean;
  tip_status: string | null;
  transaction_status: string | null;
  amount_cents: number | null;
};

export async function settlePaystackReference(
  service: SupabaseClient,
  secret: string,
  reference: string,
): Promise<PaystackSettlementResult> {
  const verifyRes = await fetch(
    `https://api.paystack.co/transaction/verify/${encodeURIComponent(reference)}`,
    { headers: { Authorization: `Bearer ${secret}` } },
  );
  const verifyJson = await verifyRes.json().catch(() => null) as {
    status?: boolean;
    data?: { status?: string; amount?: number; metadata?: Record<string, unknown> };
  } | null;

  const paystackStatus = verifyJson?.data?.status ?? "unknown";
  const success = verifyJson?.status === true && paystackStatus === "success";

  const { data: tip } = await service
    .from("tips")
    .select("id, status, amount_cents, guard_id, payer_id")
    .eq("paystack_reference", reference)
    .maybeSingle();

  const { data: tx } = await service
    .from("transactions")
    .select("id, status, amount_cents, type, user_id")
    .eq("paystack_reference", reference)
    .maybeSingle();

  if (success) {
    const meta = verifyJson?.data?.metadata ?? {};
    const metaType = typeof meta.type === "string" ? meta.type : null;
    const isGuardTip = metaType === "guard_tip" || Boolean(tip?.guard_id);
    if (isGuardTip && tip?.status === "pending") {
      const { error: finErr } = await service.rpc("finalize_tip_from_paystack_reference", {
        p_reference: reference,
      });
      if (finErr) console.error("finalize_tip_error", finErr.message, reference);
      const { error: hookErr } = await service.rpc("post_tip_settlement_hooks", { p_reference: reference });
      if (hookErr) console.error("post_tip_settlement_hooks_error", hookErr.message, reference);
    }
    await service.from("transactions").update({ status: "succeeded" }).eq("paystack_reference", reference);
  } else if (paystackStatus === "failed" || paystackStatus === "abandoned") {
    await service.from("tips").update({ status: "failed" }).eq("paystack_reference", reference);
    await service.from("transactions").update({ status: "failed" }).eq("paystack_reference", reference);
  }

  const { data: tipFresh } = await service
    .from("tips")
    .select("status, amount_cents")
    .eq("paystack_reference", reference)
    .maybeSingle();
  const { data: txFresh } = await service
    .from("transactions")
    .select("status, amount_cents")
    .eq("paystack_reference", reference)
    .maybeSingle();

  const { error: paymentEventErr } = await service.from("payment_events").upsert(
    {
      provider: "paystack",
      provider_event_id: `verify:${reference}:${paystackStatus}`,
      event_type: "transaction.verify",
      paystack_reference: reference,
      status: success ? "processed" : paystackStatus === "failed" ? "failed" : "received",
      payload: { paystack_status: paystackStatus, verified: success },
    },
    { onConflict: "provider,provider_event_id", ignoreDuplicates: true },
  );
  if (paymentEventErr) console.error("payment_events_verify", paymentEventErr.message);

  return {
    reference,
    paystack_status: paystackStatus,
    verified: success,
    tip_status: tipFresh?.status ?? tip?.status ?? null,
    transaction_status: txFresh?.status ?? tx?.status ?? null,
    amount_cents:
      tipFresh?.amount_cents ??
      txFresh?.amount_cents ??
      tip?.amount_cents ??
      tx?.amount_cents ??
      null,
  };
}

export function isValidPaystackReference(reference: string): boolean {
  return /^tg_[a-f0-9]{32}$/i.test(reference);
}
