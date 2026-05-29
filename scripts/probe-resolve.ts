/**
 * One-shot resolve_tip_target + qr_codes probe.
 * Usage: npx tsx scripts/probe-resolve.ts [token]
 */
import { createClient } from "@supabase/supabase-js";
import { loadEnvFiles } from "./lib/env.js";

loadEnvFiles();

const url = process.env.VITE_SUPABASE_URL?.trim();
const anon = process.env.VITE_SUPABASE_ANON_KEY?.trim();
const svc = process.env.SUPABASE_SERVICE_ROLE_KEY?.trim();
const token = process.argv[2]?.trim() || "demo-staging-qr-01";

if (!url || !anon) {
  console.error("Set VITE_SUPABASE_URL and VITE_SUPABASE_ANON_KEY");
  process.exit(1);
}

async function main() {
  console.log("Project URL:", url);
  const anonClient = createClient(url, anon, { auth: { persistSession: false } });
  const { data, error } = await anonClient.rpc("resolve_tip_target", { p_token: token });
  console.log("\nresolve_tip_target (anon):");
  console.log("  error:", error?.message ?? null, error?.code ?? "");
  console.log("  data:", JSON.stringify(data, null, 2));

  if (svc) {
    const admin = createClient(url, svc, { auth: { persistSession: false } });
    const { data: qr } = await admin
      .from("qr_codes")
      .select("code_token,expires_at,revoked_at,guard_id,merchant_id,qr_type")
      .eq("code_token", token)
      .maybeSingle();
    console.log("\nqr_codes row:", JSON.stringify(qr, null, 2));
    if (qr?.guard_id) {
      const { data: g } = await admin
        .from("guards")
        .select("id,verified,display_name,merchant_id")
        .eq("id", qr.guard_id)
        .maybeSingle();
      console.log("guard:", JSON.stringify(g, null, 2));
      if (g?.merchant_id) {
        const { data: m } = await admin
          .from("merchants")
          .select("id,verified,business_name")
          .eq("id", g.merchant_id)
          .maybeSingle();
        console.log("merchant:", JSON.stringify(m, null, 2));
      }
    }
  } else {
    console.warn("\n(no SUPABASE_SERVICE_ROLE_KEY — skipping qr_codes admin probe)");
  }
}

void main();
