import { createClient, type SupabaseClient } from "https://esm.sh/@supabase/supabase-js@2.49.1";

/** Service role bearer or authenticated admin JWT. */
export async function authorizeServiceOrAdmin(
  req: Request,
): Promise<{ ok: true; service: SupabaseClient } | { ok: false; status: number; error: string }> {
  const auth = req.headers.get("authorization") ?? "";
  const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "";
  const supabaseUrl = Deno.env.get("SUPABASE_URL") ?? "";

  if (!serviceKey || !supabaseUrl) {
    return { ok: false, status: 500, error: "server_misconfigured" };
  }

  if (auth === `Bearer ${serviceKey}`) {
    return {
      ok: true,
      service: createClient(supabaseUrl, serviceKey),
    };
  }

  const token = auth.startsWith("Bearer ") ? auth.slice(7).trim() : "";
  if (!token) {
    return { ok: false, status: 401, error: "unauthorized" };
  }

  const anonKey = Deno.env.get("SUPABASE_ANON_KEY") ?? "";
  const userClient = createClient(supabaseUrl, anonKey, {
    global: { headers: { Authorization: `Bearer ${token}` } },
  });
  const { data: { user }, error: userErr } = await userClient.auth.getUser();
  if (userErr || !user) {
    return { ok: false, status: 401, error: "invalid_session" };
  }

  const service = createClient(supabaseUrl, serviceKey);
  const { data: profile } = await service.from("profiles").select("role").eq("id", user.id).maybeSingle();
  if (profile?.role !== "admin") {
    return { ok: false, status: 403, error: "admin_required" };
  }

  return { ok: true, service };
}
