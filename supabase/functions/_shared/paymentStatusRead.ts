/** Read-only payment status from DB rows (no Paystack API / settlement). */

export type PaymentStatusPayload = {
  reference: string;
  paystack_status: string;
  verified: boolean;
  tip_status: string | null;
  transaction_status: string | null;
  amount_cents: number | null;
  tip_amount_cents: number | null;
  platform_fee_cents: number | null;
  charge_amount_cents: number | null;
  settled: boolean;
};

type TipRow = {
  status?: string | null;
  amount_cents?: number | null;
  commission_cents?: number | null;
  customer_paid_cents?: number | null;
};

type TxRow = {
  status?: string | null;
  amount_cents?: number | null;
};

export function readPaymentStatusFromRows(
  reference: string,
  tipRow: TipRow | null,
  txRow: TxRow | null,
): PaymentStatusPayload {
  const succeeded =
    tipRow?.status === "succeeded" || txRow?.status === "succeeded";
  const failed = tipRow?.status === "failed" || txRow?.status === "failed";
  const pending =
    !succeeded && !failed && Boolean(tipRow || txRow);

  const paystack_status = succeeded ? "success" : failed ? "failed" : pending ? "pending" : "unknown";

  return {
    reference,
    paystack_status,
    verified: succeeded,
    tip_status: tipRow?.status ?? null,
    transaction_status: txRow?.status ?? null,
    amount_cents: tipRow?.amount_cents ?? txRow?.amount_cents ?? null,
    tip_amount_cents: tipRow?.amount_cents ?? null,
    platform_fee_cents: tipRow?.commission_cents ?? null,
    charge_amount_cents: tipRow?.customer_paid_cents ?? txRow?.amount_cents ?? null,
    settled: succeeded || failed,
  };
}
