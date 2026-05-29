/**
 * Production tip token lookup — RPC + qr_codes / guards / merchants.
 *
 * Usage:
 *   npx tsx scripts/lookup-tip-token.ts <code_token>
 *   npx tsx scripts/lookup-tip-token.ts --list-active [limit]
 *
 * Requires .env: VITE_SUPABASE_URL, VITE_SUPABASE_ANON_KEY
 * Optional: SUPABASE_SERVICE_ROLE_KEY (qr_codes row + list mode)
 */
import { createClient } from "@supabase/supabase-js";
import { loadEnvFiles } from "./lib/env.js";

loadEnvFiles();

const url = process.env.VITE_SUPABASE_URL?.trim();
const anon = process.env.VITE_SUPABASE_ANON_KEY?.trim();
const svc = process.env.SUPABASE_SERVICE_ROLE_KEY?.trim();

if (!url || !anon) {
  console.error("Set VITE_SUPABASE_URL and VITE_SUPABASE_ANON_KEY in .env");
  process.exit(1);
}

function extractTokenFromUrl(input: string): string {
  const trimmed = input.trim();
  try {
    const u = new URL(trimmed.startsWith("http") ? trimmed : `https://tipguardsa.co.za${trimmed.startsWith("/") ? trimmed : `/${trimmed}`}`);
    const parts = u.pathname.split("/").filter(Boolean);
    const tipIdx = parts.findIndex((p) => p === "tip" || p === "qr" || p === "t");
    if (tipIdx >= 0 && parts[tipIdx + 1]) return decodeURIComponent(parts[tipIdx + 1]);
  } catch {
    /* plain token */
  }
  return trimmed;
}

type QrRow = {
  code_token: string;
  expires_at: string;
  revoked_at: string | null;
  guard_id: string | null;
  merchant_id: string | null;
  qr_type: string | null;
  scan_count: number | null;
  label: string | null;
};

async function lookupToken(token: string) {
  console.log("Project:", url);
  console.log("Token:", token);
  console.log("Paths: /tip/, /qr/, /t/ — same resolve_tip_target RPC\n");

  const anonClient = createClient(url!, anon!, { auth: { persistSession: false } });
  const { data, error } = await anonClient.rpc("resolve_tip_target", { p_token: token });
  console.log("resolve_tip_target (anon):");
  console.log("  HTTP error:", error?.message ?? null, error?.code ?? "");
  console.log("  rows:", Array.isArray(data) ? data.length : data ? 1 : 0);
  console.log("  data:", JSON.stringify(data, null, 2));

  if (!svc) {
    console.warn("\nSet SUPABASE_SERVICE_ROLE_KEY to inspect qr_codes / guards / merchants.");
    return;
  }

  const admin = createClient(url!, svc, { auth: { persistSession: false } });
  const { data: qr } = await admin.from("qr_codes").select("*").eq("code_token", token).maybeSingle();
  console.log("\nqr_codes:", JSON.stringify(qr, null, 2));

  if (qr) {
    const now = new Date();
    const expiresAt = new Date((qr as QrRow).expires_at);
    console.log("\nChecks:");
    console.log("  expired:", expiresAt <= now, `(${expiresAt.toISOString()})`);
    console.log("  revoked:", Boolean((qr as QrRow).revoked_at));
  }

  const guardId = (qr as QrRow | null)?.guard_id;
  const merchantId = (qr as QrRow | null)?.merchant_id;
  if (guardId) {
    const { data: g } = await admin
      .from("guards")
      .select("id,display_name,verified,merchant_id,location_id")
      .eq("id", guardId)
      .maybeSingle();
    console.log("guard:", JSON.stringify(g, null, 2));
    if (g?.merchant_id) {
      const { data: m } = await admin
        .from("merchants")
        .select("id,business_name,verified")
        .eq("id", g.merchant_id)
        .maybeSingle();
      console.log("merchant:", JSON.stringify(m, null, 2));
    }
  } else if (merchantId) {
    const { data: m } = await admin
      .from("merchants")
      .select("id,business_name,verified")
      .eq("id", merchantId)
      .maybeSingle();
    console.log("merchant (venue QR):", JSON.stringify(m, null, 2));
    const { data: guards } = await admin
      .from("guards")
      .select("id,display_name,verified,location_id")
      .eq("merchant_id", merchantId)
      .order("created_at", { ascending: true })
      .limit(10);
    console.log(
      "merchant guards:",
      JSON.stringify(guards, null, 2),
      "\n  → resolve_tip_target needs m.verified=true and at least one guard.verified=true",
    );
  }

  const { data: tipLink } = await admin
    .from("tip_links")
    .select("token,guard_id,expires_at,scan_count")
    .eq("token", token)
    .maybeSingle();
  if (tipLink) console.log("tip_links:", JSON.stringify(tipLink, null, 2));
}

async function listActive(limit: number) {
  if (!svc) {
    console.error("--list-active requires SUPABASE_SERVICE_ROLE_KEY");
    process.exit(1);
  }
  const admin = createClient(url!, svc, { auth: { persistSession: false } });
  const now = new Date().toISOString();
  const { data, error } = await admin
    .from("qr_codes")
    .select("code_token,label,qr_type,expires_at,revoked_at,scan_count,guard_id,merchant_id,created_at")
    .is("revoked_at", null)
    .gt("expires_at", now)
    .order("created_at", { ascending: false })
    .limit(limit);

  if (error) {
    console.error(error.message);
    process.exit(1);
  }

  console.log(`Active qr_codes (revoked_at null, expires_at > now), limit ${limit}:\n`);
  for (const row of data ?? []) {
    let guardName = "—";
    if (row.guard_id) {
      const { data: g } = await admin
        .from("guards")
        .select("display_name,verified")
        .eq("id", row.guard_id)
        .maybeSingle();
      guardName = g ? `${g.display_name} (verified=${g.verified})` : row.guard_id;
    }
    console.log(
      `${row.code_token}\t${row.qr_type ?? "?"}\texpires ${row.expires_at}\tscans ${row.scan_count ?? 0}\t${guardName}`,
    );
  }
}

async function main() {
  const arg = process.argv[2];
  if (!arg) {
    console.error("Usage: npx tsx scripts/lookup-tip-token.ts <token|url>");
    console.error("       npx tsx scripts/lookup-tip-token.ts --list-active [limit]");
    process.exit(1);
  }
  if (arg === "--list-active") {
    const limit = Math.min(100, Math.max(1, Number(process.argv[3]) || 50));
    await listActive(limit);
    return;
  }
  const token = extractTokenFromUrl(arg);
  await lookupToken(token);
}

void main();
