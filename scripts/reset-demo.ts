/**
 * Removes demo seed data (auth users @tipguard.staging and linked rows).
 * Usage: npx tsx scripts/reset-demo.ts
 */
import { createClient } from "@supabase/supabase-js";
import { loadEnvFiles, requireEnv } from "./lib/env.js";
import { DEMO_IDS } from "./seed-demo.js";

loadEnvFiles();
const env = requireEnv(["SUPABASE_URL", "SUPABASE_SERVICE_ROLE_KEY"]);

const admin = createClient(env.SUPABASE_URL, env.SUPABASE_SERVICE_ROLE_KEY, {
  auth: { autoRefreshToken: false, persistSession: false },
});

const DEMO_USER_IDS = [DEMO_IDS.admin, DEMO_IDS.merchant, DEMO_IDS.guard, DEMO_IDS.customer];
const DEMO_REFS = ["demo_tg_001", "demo_tg_002", "demo_tg_003"];

async function main() {
  console.log("TipGuard — reset demo data\n");

  await admin.from("transactions").delete().in("paystack_reference", DEMO_REFS);
  await admin.from("tips").delete().in("paystack_reference", DEMO_REFS);
  await admin.from("tips").delete().eq("guard_id", DEMO_IDS.guardRow);
  await admin.from("qr_codes").delete().eq("code_token", DEMO_IDS.qrToken);
  await admin.from("tip_links").delete().eq("token", DEMO_IDS.qrToken);
  await admin.from("guards").delete().eq("id", DEMO_IDS.guardRow);
  await admin.from("merchant_locations").delete().eq("id", DEMO_IDS.locationRow);
  await admin.from("merchants").delete().eq("id", DEMO_IDS.merchantRow);

  for (const id of DEMO_USER_IDS) {
    const { error } = await admin.auth.admin.deleteUser(id);
    if (error && !error.message.includes("not found")) {
      console.warn(`  warn delete ${id}: ${error.message}`);
    } else {
      console.log(`  - removed user ${id}`);
    }
  }

  console.log("\n✓ Demo data reset. Run seed-demo.ts to recreate.");
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
