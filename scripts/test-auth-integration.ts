/**
 * Auth + Supabase integration smoke test (Node).
 * Usage: npx tsx scripts/test-auth-integration.ts
 */
import { createClient } from "@supabase/supabase-js";
import { loadEnvFiles } from "./lib/env.js";

loadEnvFiles();

const url = process.env.VITE_SUPABASE_URL?.trim();
const anon = process.env.VITE_SUPABASE_ANON_KEY?.trim();
const service = process.env.SUPABASE_SERVICE_ROLE_KEY?.trim();

if (!url || !anon) {
  console.error("Missing VITE_SUPABASE_URL or VITE_SUPABASE_ANON_KEY in .env");
  process.exit(1);
}

const report = {
  envLoaded: true,
  url,
  anonKeyPrefix: anon.slice(0, 20) + "…",
  dns: "unknown" as string,
  authHealth: "unknown" as string,
  signup: "unknown" as string,
  profileTrigger: "unknown" as string,
};

async function main() {
  console.log("TipGuard — auth integration test\n");
  console.log(`URL: ${url}`);
  console.log(`Key: ${report.anonKeyPrefix}\n`);

  try {
    const health = await fetch(`${url}/auth/v1/health`, {
      headers: { apikey: anon, Authorization: `Bearer ${anon}` },
    });
    report.dns = "ok";
    report.authHealth = `${health.status}`;
    console.log(`✓ Auth health: HTTP ${health.status}`);
  } catch (e) {
    const err = e as Error & { cause?: { code?: string } };
    report.dns = err.cause?.code === "ENOTFOUND" ? "ENOTFOUND" : "fetch_failed";
    report.authHealth = err.message;
    console.error(`✗ Cannot reach Supabase Auth at ${url}`);
    console.error(`  ${err.message}`);
    if (report.dns === "ENOTFOUND") {
      console.error("\n  → Project URL does not resolve. Confirm project ref in Supabase Dashboard.");
      console.error("  → Settings → API → Project URL must match VITE_SUPABASE_URL exactly.");
    }
    process.exit(1);
  }

  const client = createClient(url, anon, { auth: { persistSession: false } });
  const testEmail = `integration-${Date.now()}@mailinator.com`;
  const testPassword = "TipGuardTest2026!";

  const { data: signData, error: signErr } = await client.auth.signUp({
    email: testEmail,
    password: testPassword,
    options: {
      emailRedirectTo: "http://localhost:5173/auth/callback",
      data: { full_name: "Integration Test", role: "customer" },
    },
  });

  if (signErr) {
    report.signup = signErr.message;
    if (signErr.status === 429) {
      console.warn(`⚠ signUp rate limited (429) — Auth API works; wait before retrying signup tests`);
    } else {
      console.error(`✗ signUp: ${signErr.message} (status ${signErr.status})`);
      process.exit(1);
    }
  } else {

    report.signup = signData!.session ? "session_returned" : "email_confirmation_required";
    console.log(`✓ signUp: ${report.signup} user=${signData!.user?.id ?? "n/a"}`);
  }

  if (service && signData?.user?.id) {
    const admin = createClient(url, service, { auth: { persistSession: false } });
    const { data: prof } = await admin.from("profiles").select("id, role, full_name").eq("id", signData.user.id).maybeSingle();
    if (prof?.id) {
      report.profileTrigger = `ok role=${prof.role}`;
      console.log(`✓ profiles row: ${prof.role} / ${prof.full_name}`);
    } else {
      report.profileTrigger = "missing";
      console.error("✗ profiles row not found — check handle_new_user trigger");
    }
    await admin.auth.admin.deleteUser(signData.user.id);
    console.log("  (test user deleted)");
  } else if (!service) {
    console.warn("⚠ SUPABASE_SERVICE_ROLE_KEY not set — skipped profiles check / cleanup");
  }

  if (signData?.user?.id && signData.session) {
    const { error: loginErr } = await client.auth.signInWithPassword({ email: testEmail, password: testPassword });
    if (loginErr) {
      console.warn(`⚠ signIn after signup: ${loginErr.message}`);
    } else {
      console.log("✓ signInWithPassword");
      const { data: sess } = await client.auth.getSession();
      if (sess.session) console.log("✓ session persistence (getSession)");
      await client.auth.signOut();
      console.log("✓ signOut");
    }
  }

  console.log("\nIntegration test complete.");
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
