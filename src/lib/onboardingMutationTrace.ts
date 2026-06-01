import type { PostgrestError } from "@supabase/supabase-js";

const ENABLED =
  import.meta.env.DEV ||
  import.meta.env.VITE_ONBOARDING_MUTATION_TRACE === "1" ||
  import.meta.env.VITE_ONBOARDING_MUTATION_TRACE === "true";

export function logOnboardingMutation(
  step: string,
  detail: {
    frontendRequest?: Record<string, unknown>;
    table?: string;
    operation?: string;
    payload?: Record<string, unknown>;
    durationMs?: number;
    data?: unknown;
    error?: PostgrestError | null;
    thrown?: unknown;
  },
): void {
  if (!ENABLED) return;
  const err = detail.error;
  const block = {
    step,
    frontendRequest: detail.frontendRequest ?? null,
    table: detail.table ?? null,
    operation: detail.operation ?? null,
    payload: detail.payload ?? null,
    durationMs: detail.durationMs ?? null,
    data: detail.data ?? null,
    sqlErrorCode: err?.code ?? null,
    sqlErrorMessage: err?.message ?? null,
    rlsDetails: err?.details ?? null,
    rlsHint: err?.hint ?? null,
    httpStatus: (err as PostgrestError & { status?: number })?.status ?? null,
    thrown:
      detail.thrown instanceof Error
        ? { message: detail.thrown.message, stack: detail.thrown.stack }
        : detail.thrown ?? null,
  };
  console.error("[TipGuard:onboarding-mutation]", JSON.stringify(block, null, 2));
}
