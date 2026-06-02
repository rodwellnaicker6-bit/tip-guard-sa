import { createClient } from "@supabase/supabase-js";
import { loadEnvFiles, requireEnv } from "./lib/env.js";

loadEnvFiles();
const env = requireEnv(["SUPABASE_URL", "SUPABASE_SERVICE_ROLE_KEY"]);

async function main() {
  const s = createClient(env.SUPABASE_URL, env.SUPABASE_SERVICE_ROLE_KEY, {
    auth: { persistSession: false },
  });

  const { error: colErr } = await s.from("tips").select("customer_paid_cents").limit(1);
  const columnOk = !colErr?.message?.includes("customer_paid_cents");
  console.log("customer_paid_cents_column", columnOk ? "PASS" : `FAIL ${colErr?.message}`);

  const { data: fee } = await s.rpc("get_platform_fee_bps");
  console.log("fee_bps", fee, fee === 200 ? "PASS" : "WARN");

  const { data: recent } = await s
    .from("tips")
    .select("amount_cents, commission_cents, customer_paid_cents, status")
    .not("customer_paid_cents", "is", null)
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();
  if (recent) {
    const ok =
      recent.customer_paid_cents ===
      (recent.amount_cents ?? 0) + (recent.commission_cents ?? 0);
    console.log("recent_tip_additive", ok ? "PASS" : "FAIL", recent);
  } else {
    console.log("recent_tip_additive", columnOk ? "PASS_NO_ROWS" : "FAIL");
  }

  process.exit(columnOk ? 0 : 1);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
