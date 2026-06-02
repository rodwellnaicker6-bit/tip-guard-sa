/**
 * Production scorecard: guest auth, payment init, admin, webhook probe.
 * Usage: npx tsx scripts/verify-production-scorecard.ts
 */
import { createClient } from "@supabase/supabase-js";
import { loadEnvFiles, requireEnv } from "./lib/env.js";

loadEnvFiles();
const env = requireEnv([
  "SUPABASE_URL",
  "SUPABASE_SERVICE_ROLE_KEY",
  "VITE_SUPABASE_ANON_KEY",
]);

const GUARD_ID = "b1000003-0003-4003-8003-000000000003";
const APP = process.env.VITE_PUBLIC_APP_URL?.trim() || "https://tipguardsa.co.za";
const DEMO_QR = "demo-staging-qr-01";

type Row = { check: string; pass: boolean; detail: string };

const rows: Row[] = [];
function record(check: string, pass: boolean, detail: string) {
  rows.push({ check, pass, detail });
  console.log(pass ? "PASS" : "FAIL", check, "—", detail);
}

async function main() {
  const base = env.SUPABASE_URL.replace(/\/$/, "");
  const fnUrl = `${base}/functions/v1/paystack-initialize`;

  const anon = createClient(env.SUPABASE_URL, env.VITE_SUPABASE_ANON_KEY, {
    auth: { persistSession: false },
  });

  const tipRes = await fetch(`${APP}/tip/${DEMO_QR}`, { method: "GET" });
  record("Tip page HTTP", tipRes.ok, `${tipRes.status} ${APP}/tip/${DEMO_QR}`);

  const { data: anonData, error: anonErr } = await anon.auth.signInAnonymously();
  if (anonErr || !anonData.session) {
    record("Anonymous sign-in", false, anonErr?.message ?? "no session");
  } else {
    record("Anonymous sign-in", true, anonData.session.user.id);

    const jwt = anonData.session.access_token;
    const amountCents = 2000 + (Date.now() % 97);
    const initRes = await fetch(fnUrl, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${jwt}`,
        apikey: env.VITE_SUPABASE_ANON_KEY,
      },
      body: JSON.stringify({ kind: "tip", guard_id: GUARD_ID, amount_cents: amountCents }),
    });
    const initBody = await initRes.text();
    const initOk = initRes.ok && initBody.includes("authorization_url");
    record(
      "paystack-initialize (guest JWT)",
      initOk,
      `${initRes.status} ${initBody.slice(0, 120)}`,
    );
  }

  const password = process.env.DEMO_PASSWORD?.trim() || "TipGuardDemo2026!";
  const adminClient = createClient(env.SUPABASE_URL, env.VITE_SUPABASE_ANON_KEY, {
    auth: { persistSession: false },
  });
  const { data: adminAuth, error: adminErr } = await adminClient.auth.signInWithPassword({
    email: "demo-admin@tipguard.staging",
    password,
  });
  if (adminErr || !adminAuth.user) {
    record("Admin login", false, adminErr?.message ?? "no user");
  } else {
    const { data: prof } = await adminClient
      .from("profiles")
      .select("role")
      .eq("id", adminAuth.user.id)
      .single();
    record("Admin role", prof?.role === "admin", `role=${prof?.role ?? "null"}`);
  }

  const adminRes = await fetch(`${APP}/admin`, { method: "GET", redirect: "manual" });
  record("Admin route HTTP", adminRes.status === 200 || adminRes.status === 307, `${adminRes.status}`);

  const webhookRes = await fetch(`${base}/functions/v1/paystack-webhook`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: "{}",
  });
  record(
    "Webhook rejects unsigned",
    webhookRes.status === 400 || webhookRes.status === 401,
    `${webhookRes.status}`,
  );

  console.log("\n--- Scorecard ---");
  const failed = rows.filter((r) => !r.pass);
  for (const r of rows) {
    console.log(`${r.pass ? "PASS" : "FAIL"}\t${r.check}\t${r.detail}`);
  }
  console.log(`\n${rows.length - failed.length}/${rows.length} passed`);
  process.exit(failed.length ? 1 : 0);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
