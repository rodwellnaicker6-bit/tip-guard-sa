/**
 * Rate-limit scaffolding for Edge Functions.
 * Post-MVP: insert into public.api_rate_log via service_role and enforce per-IP / per-user caps.
 *
 * Example (in your handler):
 *   const key = `paystack-initialize:${userId}`;
 *   if (!(await checkRateLimit(service, key, { max: 30, windowSec: 60 }))) {
 *     return new Response(JSON.stringify({ error: "rate_limited" }), { status: 429 });
 *   }
 */

export type RateLimitConfig = {
  max: number;
  windowSec: number;
};

/** Stub — always allows; wire to api_rate_log when ops table is populated. */
export async function checkRateLimit(
  service: unknown,
  key: string,
  config: RateLimitConfig,
): Promise<boolean> {
  void service;
  void key;
  void config;
  return true;
}
