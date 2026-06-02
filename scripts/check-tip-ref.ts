import { createClient } from "@supabase/supabase-js";
import { loadEnvFiles, requireEnv } from "./lib/env.js";

const ref = process.argv[2]?.trim();
if (!ref) {
  console.error("Usage: npx tsx scripts/check-tip-ref.ts <paystack_reference>");
  process.exit(1);
}

loadEnvFiles();
const env = requireEnv(["SUPABASE_URL", "SUPABASE_SERVICE_ROLE_KEY"]);
const admin = createClient(env.SUPABASE_URL, env.SUPABASE_SERVICE_ROLE_KEY, {
  auth: { persistSession: false },
});

async function main() {
  const { data: tip, error: tErr } = await admin
    .from("tips")
    .select("id,status,amount_cents,paystack_reference,created_at,updated_at")
    .eq("paystack_reference", ref)
    .maybeSingle();
  console.log("tip", tErr?.message ?? JSON.stringify(tip));

  const { data: wh } = await admin
    .from("paystack_webhook_events")
    .select("id,type,created_at")
    .order("created_at", { ascending: false })
    .limit(5);
  console.log("recent paystack_webhook_events", JSON.stringify(wh));

  const { data: earn, error: eErr } = await admin.rpc("guard_earnings_summary", {
    p_guard_id: "b1000003-0003-4003-8003-000000000003",
  });
  console.log("guard_earnings", eErr?.message ?? JSON.stringify(earn));
}

main();
