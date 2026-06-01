/**
 * Clear tip_sessions for demo QR so guest checkout can be re-tested.
 * Usage: npx tsx scripts/reset-demo-tip-link.ts [token]
 */
import { createClient } from "@supabase/supabase-js";
import { loadEnvFiles, requireEnv } from "./lib/env.js";

const TOKEN = process.argv[2]?.trim() || "demo-staging-qr-01";

loadEnvFiles();
const env = requireEnv(["SUPABASE_URL", "SUPABASE_SERVICE_ROLE_KEY"]);

async function main() {
  const admin = createClient(env.SUPABASE_URL, env.SUPABASE_SERVICE_ROLE_KEY, {
    auth: { persistSession: false },
  });
  const { error } = await admin.from("tip_sessions").delete().eq("source_link_token", TOKEN);
  if (error) {
    console.error("FAIL:", error.message);
    process.exit(1);
  }
  console.log("✓ Cleared tip_sessions for", TOKEN);
}

main();
