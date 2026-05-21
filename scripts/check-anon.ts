import { createClient } from "@supabase/supabase-js";
import { loadEnvFiles } from "./lib/env.js";

loadEnvFiles();

const url = process.env.VITE_SUPABASE_URL!;
const anon = process.env.VITE_SUPABASE_ANON_KEY!;
const c = createClient(url, anon, { auth: { persistSession: false } });

const { error: gErr } = await c.from("guards").select("id").limit(1);
console.log("anon guards:", gErr?.code, gErr?.message);

for (const rpc of ["touch_tip_link", "resolve_tip_target", "admin_dashboard_metrics"]) {
  const { error } = await c.rpc(rpc, rpc === "resolve_tip_target" ? { p_token: "x" } : {});
  console.log(rpc, ":", error?.code, error?.message?.slice(0, 80));
}
