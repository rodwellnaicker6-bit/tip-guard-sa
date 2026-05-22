import type { SupabaseClient } from "https://esm.sh/@supabase/supabase-js@2.49.1";

export async function runFraudChecks(
  service: SupabaseClient,
  opts: {
    userId: string;
    amountCents?: number;
    reference?: string;
    route?: string;
  },
): Promise<{ blocked: boolean; triggered: unknown[] }> {
  const { data, error } = await service.rpc("run_fraud_checks", {
    p_user_id: opts.userId,
    p_amount_cents: opts.amountCents ?? null,
    p_reference: opts.reference ?? null,
    p_route: opts.route ?? "payment",
  });
  if (error) {
    console.error("run_fraud_checks", error);
    return { blocked: false, triggered: [] };
  }
  const result = data as { blocked?: boolean; triggered?: unknown[] } | null;
  return {
    blocked: result?.blocked === true,
    triggered: Array.isArray(result?.triggered) ? result.triggered : [],
  };
}
