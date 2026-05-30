import { corsHeaders } from "./cors.ts";

/** When MAINTENANCE_MODE secret is true/1/yes, payment Edge routes return 503 JSON. */
export function isMaintenanceMode(): boolean {
  const v = (Deno.env.get("MAINTENANCE_MODE") ?? "").trim().toLowerCase();
  return v === "true" || v === "1" || v === "yes";
}

export function maintenanceResponse(): Response {
  return new Response(
    JSON.stringify({ error: "maintenance", message: "TipGuard is temporarily unavailable.", code: "maintenance" }),
    { status: 503, headers: { ...corsHeaders, "Content-Type": "application/json" } },
  );
}
