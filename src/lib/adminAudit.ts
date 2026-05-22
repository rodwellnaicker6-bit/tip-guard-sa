import { supabase } from "./supabase";

export async function logAdminAction(
  action: string,
  entityType?: string,
  entityId?: string,
  metadata?: Record<string, unknown>,
): Promise<void> {
  const { error } = await supabase.rpc("log_admin_audit", {
    p_action: action,
    p_entity_type: entityType ?? null,
    p_entity_id: entityId ?? null,
    p_metadata: metadata ?? {},
  });
  if (error) console.warn("log_admin_audit", error.message);
}
