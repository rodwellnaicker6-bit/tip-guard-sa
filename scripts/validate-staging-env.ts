/**
 * Validates staging / production environment variables before deploy.
 * Usage: npx tsx scripts/validate-staging-env.ts [--staging]
 */
import { loadEnvFiles } from "./lib/env.js";

loadEnvFiles();

const staging = process.argv.includes("--staging");

const clientRequired = ["VITE_SUPABASE_URL", "VITE_SUPABASE_ANON_KEY", "VITE_PAYSTACK_PUBLIC_KEY"] as const;
const edgeRequired = ["SUPABASE_URL", "SUPABASE_SERVICE_ROLE_KEY", "PAYSTACK_SECRET_KEY"] as const;
const deployRecommended = ["VITE_PUBLIC_APP_URL", "PUBLIC_APP_URL"] as const;
const placeholders = ["VITE_YOCO_PUBLIC_KEY", "VITE_OZOW_SITE_CODE", "VITE_PAYFAST_MERCHANT_ID"] as const;

function ok(v: string | undefined) {
  return Boolean(v?.trim()) && !v!.includes("YOUR_") && !v!.includes("your_") && !v!.includes("xxxxxxxx");
}

let exitCode = 0;

console.log(staging ? "TipGuard — staging env check\n" : "TipGuard — environment check\n");

for (const k of clientRequired) {
  if (!ok(process.env[k])) {
    console.error(`✗ ${k} — missing or placeholder`);
    exitCode = 1;
  } else {
    console.log(`✓ ${k}`);
  }
}

for (const k of edgeRequired) {
  if (!ok(process.env[k])) {
    console.warn(`⚠ ${k} — required for Edge Functions / seed scripts (set in Supabase secrets or .env for local)`);
    if (staging) exitCode = 1;
  } else {
    console.log(`✓ ${k}`);
  }
}

for (const k of deployRecommended) {
  if (!ok(process.env[k])) {
    console.warn(`⚠ ${k} — recommended for canonical auth/payment callback URLs`);
  } else {
    console.log(`✓ ${k}`);
  }
}

const canonicalAppUrl = process.env.VITE_PUBLIC_APP_URL?.trim() || process.env.PUBLIC_APP_URL?.trim();
if (canonicalAppUrl) {
  try {
    const origin = new URL(canonicalAppUrl).origin;
    if (!staging && origin !== "https://tipguardsa.co.za") {
      console.warn(`⚠ canonical app URL is ${origin}; production launch target is https://tipguardsa.co.za`);
    }
  } catch {
    console.error("✗ canonical app URL is not a valid URL");
    exitCode = 1;
  }
}

console.log("\nOptional gateway placeholders:");
for (const k of placeholders) {
  console.log(`  ${k}: ${ok(process.env[k]) ? "set" : "not set (OK for Paystack-only staging)"}`);
}

if (process.env.VITE_PAYSTACK_PUBLIC_KEY?.startsWith("pk_test_")) {
  console.log("\n✓ Paystack public key is test mode (sandbox).");
} else if (process.env.VITE_PAYSTACK_PUBLIC_KEY?.startsWith("pk_live_")) {
  console.warn("\n⚠ Paystack public key is LIVE — use pk_test_ on staging.");
}

const url = process.env.VITE_SUPABASE_URL?.trim();
if (url) {
  try {
    const health = await fetch(`${url.replace(/\/$/, "")}/auth/v1/health`, {
      headers: { apikey: process.env.VITE_SUPABASE_ANON_KEY?.trim() ?? "" },
    });
    if (health.ok || health.status === 401) {
      console.log(`\n✓ Supabase Auth reachable at ${url} (HTTP ${health.status})`);
    } else {
      console.warn(`\n⚠ Supabase Auth returned HTTP ${health.status} for ${url}`);
    }
  } catch (e) {
    const err = e as Error & { cause?: { code?: string } };
    console.error(`\n✗ Cannot reach ${url} — ${err.message}`);
    if (err.cause?.code === "ENOTFOUND") {
      console.error("  → Typo in project ref? Copy Project URL exactly from Supabase Dashboard → Settings → API.");
    }
    exitCode = 1;
  }
}

if (exitCode) {
  console.error("\nFix the issues above, then re-run. See docs/STAGING_DEPLOYMENT.md");
  process.exit(exitCode);
}
console.log("\nEnvironment looks ready for staging deploy.");
