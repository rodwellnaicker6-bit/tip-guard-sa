import type { SupabaseClient } from "https://esm.sh/@supabase/supabase-js@2.49.1";

export type FraudCheckResult = {
  blocked: boolean;
  triggered: unknown[];
  /** RPC missing or failed — callers must not block pay/payout. */
  rpcUnavailable: boolean;
};

const FRAUD_RPC_TIMEOUT_MS = 3_000;

function isMissingRpcError(error: { code?: string; message?: string }): boolean {
  const code = error.code ?? "";
  const msg = (error.message ?? "").toLowerCase();
  return (
    code === "PGRST202" ||
    code === "42883" ||
    msg.includes("could not find the function") ||
    msg.includes("run_fraud_checks")
  );
}

function isTimeoutError(message: string): boolean {
  return message.toLowerCase().includes("fraud rpc timeout");
}

async function rpcWithTimeout(
  service: SupabaseClient,
  opts: {
    userId: string;
    amountCents?: number;
    reference?: string;
    route?: string;
  },
) {
  const rpcPromise = service.rpc("run_fraud_checks", {
    p_user_id: opts.userId,
    p_amount_cents: opts.amountCents ?? null,
    p_reference: opts.reference ?? null,
    p_route: opts.route ?? "payment",
  });

  let timer: ReturnType<typeof setTimeout> | undefined;
  const timeoutPromise = new Promise<never>((_, reject) => {
    timer = setTimeout(() => reject(new Error("fraud RPC timeout")), FRAUD_RPC_TIMEOUT_MS);
  });

  try {
    return await Promise.race([rpcPromise, timeoutPromise]);
  } finally {
    if (timer) clearTimeout(timer);
  }
}

/**
 * Runs fraud rules via service_role RPC. Never throws; never blocks pay/payout when RPC is missing.
 */
export async function runFraudChecks(
  service: SupabaseClient,
  opts: {
    userId: string;
    amountCents?: number;
    reference?: string;
    route?: string;
  },
): Promise<FraudCheckResult> {
  const failOpen: FraudCheckResult = { blocked: false, triggered: [], rpcUnavailable: true };

  try {
    const { data, error } = await rpcWithTimeout(service, opts);

    if (error) {
      if (isMissingRpcError(error)) {
        console.warn("[TipGuard:fraud] run_fraud_checks missing — fail open", {
          route: opts.route,
          code: error.code,
          message: error.message,
        });
      } else {
        console.warn("[TipGuard:fraud] run_fraud_checks error — fail open", {
          route: opts.route,
          code: error.code,
          message: error.message,
        });
      }
      return failOpen;
    }

    const result = data as { blocked?: boolean; triggered?: unknown[] } | null;
    return {
      blocked: result?.blocked === true,
      triggered: Array.isArray(result?.triggered) ? result.triggered : [],
      rpcUnavailable: false,
    };
  } catch (e) {
    const message = e instanceof Error ? e.message : String(e);
    const level = isTimeoutError(message) ? "warn" : "error";
    const log = level === "warn" ? console.warn : console.error;
    log("[TipGuard:fraud] run_fraud_checks exception — fail open", {
      route: opts.route,
      message,
    });
    return failOpen;
  }
}
