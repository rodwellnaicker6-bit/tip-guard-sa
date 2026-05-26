import { supabase } from "./supabase";
import { unwrapRpcSingle } from "./rpcData";
import { stabilLog } from "./stabilLog";

export type ResolvedTipTarget = {
  guard_id: string;
  location_id: string | null;
  merchant_id: string | null;
  guard_display_name: string;
  default_amount_cents: number | null;
  scan_count: number;
  qr_type?: string | null;
};

function mapRow(row: Record<string, unknown>): ResolvedTipTarget | null {
  const guardId = row.guard_id as string | undefined;
  if (!guardId) return null;
  return {
    guard_id: guardId,
    location_id: (row.location_id as string | null) ?? null,
    merchant_id: (row.merchant_id as string | null) ?? null,
    guard_display_name: String(row.guard_display_name ?? "Guard"),
    default_amount_cents: (row.default_amount_cents as number | null) ?? null,
    scan_count: Number(row.scan_count ?? 0),
    qr_type: (row.qr_type as string | null) ?? null,
  };
}

/** Resolve QR/token to guard — uses `resolve_tip_target`, falls back to `resolve_tip_link` + guard row. */
export async function resolveTipTarget(token: string): Promise<{
  target: ResolvedTipTarget | null;
  error: string | null;
}> {
  const trimmed = token.trim();
  if (trimmed.length < 4) {
    return { target: null, error: "This tip link is too short or invalid." };
  }

  try {
    stabilLog("qr", "resolve tip target start", { tokenLen: trimmed.length });

    await Promise.allSettled([
      supabase.rpc("touch_tip_link", { p_token: trimmed }),
      supabase.rpc("touch_qr_code", { p_code_token: trimmed }),
    ]);

    const { data, error: rpcErr } = await supabase.rpc("resolve_tip_target", { p_token: trimmed });
    if (!rpcErr && data) {
      const row = Array.isArray(data)
        ? (data[0] as Record<string, unknown> | undefined)
        : (data as Record<string, unknown>);
      const mapped = row ? mapRow(row) : null;
      if (mapped) {
        stabilLog("qr", "resolve tip target ok", { guardId: mapped.guard_id });
        return { target: mapped, error: null };
      }
    }

    const isMissingRpc =
      rpcErr?.message?.includes("Could not find the function") ||
      rpcErr?.code === "PGRST202";

    if (!isMissingRpc && rpcErr) {
      return { target: null, error: rpcErr.message };
    }

    const { data: linkData, error: linkErr } = await supabase.rpc("resolve_tip_link", { p_token: trimmed });
    if (linkErr) {
      return {
        target: null,
        error: linkErr.message.includes("Could not find")
          ? "Tip links are not configured on this database yet. Ask your operator to run migrations."
          : linkErr.message,
      };
    }

    const guardId = unwrapRpcSingle<string>(linkData);
    if (!guardId) {
      return { target: null, error: "This QR code is invalid, expired, or the guard is not verified for payments." };
    }

    const { data: guard, error: gErr } = await supabase
      .from("guards")
      .select("id, display_name, verified, merchant_id, location_id")
      .eq("id", guardId)
      .maybeSingle();

    if (gErr) return { target: null, error: gErr.message };
    if (!guard?.id) return { target: null, error: "Guard profile not found for this link." };
    if (!guard.verified) {
      return { target: null, error: "This guard is not verified for receiving tips yet." };
    }

    stabilLog("qr", "resolve tip target ok", { guardId: guard.id });
    return {
      target: {
        guard_id: guard.id,
        location_id: guard.location_id ?? null,
        merchant_id: guard.merchant_id ?? null,
        guard_display_name: String(guard.display_name ?? "Guard"),
        default_amount_cents: null,
        scan_count: 0,
      },
      error: null,
    };
  } catch (e) {
    const msg = e instanceof Error ? e.message : "Could not load this tip link.";
    console.error("[TipGuard:qr] resolveTipTarget failed", e);
    return { target: null, error: msg };
  }
}
