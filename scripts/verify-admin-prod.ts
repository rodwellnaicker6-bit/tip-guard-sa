import { createClient } from "@supabase/supabase-js";
import { loadEnvFiles, requireEnv } from "./lib/env.js";

loadEnvFiles();
const env = requireEnv(["SUPABASE_URL", "VITE_SUPABASE_ANON_KEY"]);

async function main() {
  const password = process.env.DEMO_PASSWORD?.trim() || "TipGuardDemo2026!";
  const c = createClient(env.SUPABASE_URL, env.VITE_SUPABASE_ANON_KEY, {
    auth: { persistSession: false },
  });
  const { data, error } = await c.auth.signInWithPassword({
    email: "demo-admin@tipguard.staging",
    password,
  });
  if (error || !data.user) {
    console.error("login FAIL:", error?.message);
    process.exit(1);
  }
  const { data: prof, error: pErr } = await c
    .from("profiles")
    .select("role")
    .eq("id", data.user.id)
    .single();
  if (pErr) {
    console.error("profile FAIL:", pErr.message);
    process.exit(1);
  }
  console.log("OK admin login", data.user.id, "role=", prof?.role);
  process.exit(prof?.role === "admin" ? 0 : 1);
}

main();
