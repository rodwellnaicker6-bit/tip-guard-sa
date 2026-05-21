/**
 * Paystack reconciliation scaffolding (post-MVP: nightly job + admin reports).
 * Edge stub: supabase/functions/paystack-reconcile
 */

export type ReconciliationStatus = "pending" | "matched" | "mismatch" | "missing_local" | "missing_provider";

export type ReconciliationRow = {
  paystackReference: string;
  localTransactionId?: string;
  amountCents: number;
  providerStatus: string;
  localStatus?: string;
  status: ReconciliationStatus;
  checkedAt: string;
};

export type ReconciliationBatch = {
  id: string;
  from: string;
  to: string;
  rows: ReconciliationRow[];
  createdAt: string;
};

/** Placeholder — compare Paystack transaction list vs local `transactions` table. */
export function buildReconciliationStub(reference: string, amountCents: number): ReconciliationRow {
  return {
    paystackReference: reference,
    amountCents,
    providerStatus: "unknown",
    status: "pending",
    checkedAt: new Date().toISOString(),
  };
}
