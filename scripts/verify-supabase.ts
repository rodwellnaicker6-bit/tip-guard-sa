/**
 * Post-migration checks against your linked Supabase project.
 * Requires .env with VITE_* (anon) and SUPABASE_SERVICE_ROLE_KEY for full checks.
 *
 * Usage: npx tsx scripts/verify-supabase.ts
 */
import { createClient } from "@supabase/supabase-js";
import { loadEnvFiles } from "./lib/env.js";

loadEnvFiles();

const url = process.env.VITE_SUPABASE_URL?.trim() || process.env.SUPABASE_URL?.trim();
const anon = process.env.VITE_SUPABASE_ANON_KEY?.trim();
const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY?.trim();

if (!url || !anon) {
  console.error("Set VITE_SUPABASE_URL and VITE_SUPABASE_ANON_KEY in .env");
  process.exit(1);
}

const anonClient = createClient(url, anon, { auth: { persistSession: false } });
const admin = serviceKey
  ? createClient(url, serviceKey, { auth: { autoRefreshToken: false, persistSession: false } })
  : null;

let failed = 0;

function pass(msg: string) {
  console.log(`✓ ${msg}`);
}
function fail(msg: string, detail?: string) {
  failed += 1;
  console.error(`✗ ${msg}${detail ? ` — ${detail}` : ""}`);
}
function warn(msg: string) {
  console.warn(`⚠ ${msg}`);
}

async function checkRpc(name: string, args: Record<string, unknown> = {}) {
  const { error } = await anonClient.rpc(name, args);
  if (error) {
    if (error.message.includes("Could not find the function") || error.code === "PGRST202") {
      fail(`RPC ${name}`, "function missing — run supabase db push");
    } else if (error.message.includes("forbidden") || error.message.includes("permission")) {
      pass(`RPC ${name} (exists; auth/role blocked as expected for anon)`);
    } else {
      warn(`RPC ${name}: ${error.message}`);
    }
  } else {
    pass(`RPC ${name}`);
  }
}

async function main() {
  console.log("TipGuard — Supabase verification\n");
  console.log(`Project: ${url}\n`);

  // Auth API reachable
  const { error: authErr } = await anonClient.auth.getSession();
  if (authErr) fail("Auth API", authErr.message);
  else pass("Auth API reachable");

  // Core RPCs (anon)
  await checkRpc("resolve_tip_target", { p_token: "demo-staging-qr-01" });
  await checkRpc("touch_tip_link", { p_token: "demo-staging-qr-01" });
  await checkRpc("touch_qr_code", { p_code_token: "demo-staging-qr-01" });

  // Admin RPC should exist but reject anon
  await checkRpc("admin_payment_analytics");
  await checkRpc("admin_dashboard_metrics");

  // Public data (RLS: guards browsable)
  const { data: guards, error: gErr } = await anonClient.from("guards").select("id").limit(1);
  if (gErr) fail("RLS guards (anon read)", gErr.message);
  else pass(`RLS guards (anon read) — ${guards?.length ?? 0} row(s) visible`);

  // payment_events must not be readable by anon
  const { error: peErr } = await anonClient.from("payment_events").select("id").limit(1);
  if (peErr) pass("RLS payment_events (anon blocked)");
  else fail("RLS payment_events", "anon should not read payment_events");

  if (!admin) {
    warn("SUPABASE_SERVICE_ROLE_KEY not set — skipping storage + service_role checks");
  } else {
    const { error: claimErr } = await admin.rpc("claim_tip_link_session", {
      p_link_token: "",
      p_guard_id: "00000000-0000-0000-0000-000000000001",
      p_payer_id: "00000000-0000-0000-0000-000000000002",
    });
    if (claimErr?.code === "PGRST202" || claimErr?.message.includes("Could not find the function")) {
      fail("RPC claim_tip_link_session", "missing — apply 20260625160000_launch_qr_hardening.sql");
    } else {
      pass("RPC claim_tip_link_session (launch QR hardening)");
    }

    const { error: qrColErr } = await admin.from("qr_codes").select("expires_at, revoked_at, qr_type").limit(1);
    if (qrColErr?.message.includes("expires_at") || qrColErr?.code === "42703") {
      fail("qr_codes columns", "missing — apply launch migrations");
    } else if (qrColErr) {
      warn(`qr_codes columns: ${qrColErr.message}`);
    } else {
      pass("qr_codes expires_at, revoked_at, qr_type");
    }

    const { error: regenErr } = await admin.rpc("regenerate_qr_code_token", {
      p_qr_id: "00000000-0000-0000-0000-000000000001",
    });
    if (regenErr?.code === "PGRST202" || regenErr?.message.includes("Could not find the function")) {
      fail("RPC regenerate_qr_code_token", "missing — apply 20260625170000_merchant_ops_launch.sql");
    } else {
      pass("RPC regenerate_qr_code_token (exists)");
    }
    const { data: buckets, error: bErr } = await admin.storage.listBuckets();
    if (bErr) fail("Storage listBuckets", bErr.message);
    else {
      const hasGuard = buckets?.some((b) => b.id === "guard-photos");
      if (hasGuard) pass("Storage bucket guard-photos");
      else fail("Storage bucket guard-photos", "missing — apply 20250513000000_production.sql");
    }

    const { data: demoGuard } = await admin
      .from("guards")
      .select("id, display_name")
      .eq("id", "b1000003-0003-4003-8003-000000000003")
      .maybeSingle();
    if (demoGuard?.id) pass("Demo guard row present (run npm run seed:demo if missing)");
    else warn("Demo guard not found — run: npm run seed:demo");

    const { data: demoUsers } = await admin.auth.admin.listUsers({ perPage: 200 });
    const demoEmails = (demoUsers?.users ?? []).filter((u) => u.email?.endsWith("@tipguard.staging"));
    if (demoEmails.length >= 4) pass(`Demo auth users (${demoEmails.length})`);
    else warn(`Only ${demoEmails.length} @tipguard.staging users — run: npm run seed:demo`);
  }

  // Key tables exist (service or anon)
  const client = admin ?? anonClient;
  for (const table of ["merchants", "merchant_locations", "qr_codes", "tips", "transactions"]) {
    const { error } = await client.from(table).select("id", { count: "exact", head: true });
    if (error?.message.includes("does not exist") || error?.code === "42P01") {
      fail(`Table ${table}`, "missing — run migrations");
    } else if (error && !admin) {
      warn(`Table ${table}: ${error.message}`);
    } else {
      pass(`Table ${table}`);
    }
  }

  console.log(failed ? `\n${failed} check(s) failed.` : "\nAll checks passed.");
  process.exit(failed ? 1 : 0);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
