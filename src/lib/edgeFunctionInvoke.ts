import {
  FunctionsFetchError,
  FunctionsHttpError,
  FunctionsRelayError,
} from "@supabase/supabase-js";
import { isBootDebug } from "./bootDebug";
import { normalizeSupabaseUrl, projectRefFromSupabaseUrl } from "./supabaseProject";

/** Verbose payment invoke logs (dev, VITE_DEBUG_BOOT, or VITE_DEBUG_PAY). */
export const isPayDebug =
  isBootDebug ||
  import.meta.env.VITE_DEBUG_PAY === "true" ||
  import.meta.env.VITE_DEBUG_PAY === "1";

/** Resolved Edge Function URL for diagnostics (no secrets). */
export function edgeFunctionUrl(functionName: string): string | null {
  const raw = import.meta.env.VITE_SUPABASE_URL?.trim();
  if (!raw) return null;
  const base = normalizeSupabaseUrl(raw).replace(/\/$/, "");
  return `${base}/functions/v1/${functionName}`;
}

export type InvokeErrorDetail = {
  message: string;
  status?: number;
  code?: string;
  bodySnippet?: string;
};

/** Extract JSON/text body from FunctionsHttpError (supabase-js hides it in error.message). */
export async function parseFunctionsInvokeError(error: unknown): Promise<InvokeErrorDetail> {
  if (error instanceof FunctionsHttpError) {
    const res = error.context as Response | undefined;
    const status = res?.status;
    let bodySnippet = "";
    let code: string | undefined;
    let message = error.message;

    if (res) {
      try {
        bodySnippet = await res.text();
        if (bodySnippet) {
          try {
            const json = JSON.parse(bodySnippet) as {
              error?: string;
              message?: string;
              code?: string;
            };
            code = json.code;
            message = json.error ?? json.message ?? bodySnippet.slice(0, 300);
          } catch {
            message = bodySnippet.slice(0, 300);
          }
        } else if (status) {
          message = `Payment server error (HTTP ${status})`;
        }
      } catch {
        message = status ? `Payment server error (HTTP ${status})` : message;
      }
    }

    return { message, status, code, bodySnippet: bodySnippet.slice(0, 500) };
  }

  if (error instanceof FunctionsRelayError) {
    return { message: error.message || "Edge relay error invoking payment server" };
  }

  if (error instanceof FunctionsFetchError) {
    return { message: error.message || "Network error calling payment server" };
  }

  if (error instanceof Error) {
    return { message: error.message };
  }

  return { message: String(error) };
}

export function logPayInvokeStart(
  functionName: string,
  body: Record<string, unknown>,
): void {
  if (!isPayDebug) return;
  const url = edgeFunctionUrl(functionName);
  const project = projectRefFromSupabaseUrl(import.meta.env.VITE_SUPABASE_URL ?? "");
  console.info(`[TipGuard:pay] → POST ${functionName}`, {
    url,
    project,
    method: "POST",
    headers: { "Content-Type": "application/json", Authorization: "[session JWT]" },
    body: {
      ...body,
      device_fingerprint: body.device_fingerprint ? "[redacted]" : undefined,
    },
  });
}

export function logPayInvokeFailure(
  functionName: string,
  detail: InvokeErrorDetail,
  ms: number,
): void {
  console.error(`[TipGuard:pay] ← ${functionName} failed`, {
    url: edgeFunctionUrl(functionName),
    status: detail.status,
    code: detail.code,
    message: detail.message,
    body: detail.bodySnippet,
    ms,
  });
}

export function logPayInvokeSuccess(functionName: string, ms: number): void {
  if (!isPayDebug) return;
  console.info(`[TipGuard:pay] ← ${functionName} ok`, {
    url: edgeFunctionUrl(functionName),
    status: 200,
    ms,
  });
}
