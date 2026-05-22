/**
 * Rate limiting for Edge Functions via public.api_rate_log (service_role writes).
 */

import type { SupabaseClient } from "https://esm.sh/@supabase/supabase-js@2.49.1";

export type RateLimitConfig = {
  max: number;
  windowSec: number;
};

export async function checkRateLimit(
  service: SupabaseClient,
  key: { userId: string; route: string },
  config: RateLimitConfig,
): Promise<boolean> {
  const since = new Date(Date.now() - config.windowSec * 1000).toISOString();
  const { count, error } = await service
    .from("api_rate_log")
    .select("id", { count: "exact", head: true })
    .eq("user_id", key.userId)
    .eq("route", key.route)
    .gte("created_at", since);

  if (error) {
    console.error("rate_limit_count", key.route, error.message);
    return true;
  }
  return (count ?? 0) < config.max;
}

export async function recordRateLimitHit(
  service: SupabaseClient,
  key: { userId: string; route: string },
): Promise<void> {
  const { error } = await service.from("api_rate_log").insert({
    user_id: key.userId,
    route: key.route,
  });
  if (error) console.error("rate_limit_insert", key.route, error.message);
}
