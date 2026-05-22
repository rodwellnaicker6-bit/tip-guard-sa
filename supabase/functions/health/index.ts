import { serve } from "https://deno.land/std@0.224.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.49.1";

serve(async (req) => {
  if (req.method !== "GET" && req.method !== "HEAD") {
    return new Response("Method not allowed", { status: 405 });
  }

  const version = Deno.env.get("APP_VERSION")?.trim() ||
    Deno.env.get("VERCEL_GIT_COMMIT_SHA")?.slice(0, 7) ||
    "unknown";

  let supabase: "ok" | "degraded" | "unconfigured" = "unconfigured";
  const url = Deno.env.get("SUPABASE_URL") ?? "";
  const key = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "";

  if (url && key) {
    try {
      const client = createClient(url, key);
      const { error } = await client.from("platform_settings").select("id").limit(1);
      supabase = error ? "degraded" : "ok";
    } catch {
      supabase = "degraded";
    }
  }

  const maintenance = (Deno.env.get("MAINTENANCE_MODE") ?? "").trim().toLowerCase();
  const body = {
    ok: supabase === "ok",
    supabase,
    version,
    maintenance: maintenance === "true" || maintenance === "1" || maintenance === "yes",
    ts: new Date().toISOString(),
  };

  const status = supabase === "ok" ? 200 : supabase === "degraded" ? 503 : 503;
  if (req.method === "HEAD") {
    return new Response(null, { status });
  }

  return new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json", "Cache-Control": "no-store" },
  });
});
