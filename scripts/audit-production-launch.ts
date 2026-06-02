/**
 * Production launch audit (API/DB layer). Browser checks are separate.
 * Usage: npx tsx scripts/audit-production-launch.ts
 */
import { createClient } from "@supabase/supabase-js";
import { loadEnvFiles, requireEnv } from "./lib/env.js";

loadEnvFiles();
const env = requireEnv([
  "SUPABASE_URL",
  "SUPABASE_SERVICE_ROLE_KEY",
  "VITE_SUPABASE_ANON_KEY",
]);
const APP = process.env.VITE_PUBLIC_APP_URL?.trim() || "https://tipguardsa.co.za";
const DEMO_QR = "demo-staging-qr-01";
const GUARD_ID = "b1000003-0003-4003-8003-000000000003";
const MERCHANT_UID = "d1000002-0002-4002-8002-000000000002";

type Row = { id: number; name: string; pass: boolean; detail: string };
const rows: Row[] = [];
let id = 0;

function record(name: string, pass: boolean, detail: string) {
  rows.push({ id: ++id, name, pass, detail });
  console.log(pass ? "PASS" : "FAIL", name, "—", detail.slice(0, 120));
}

async function main() {
  const admin = createClient(env.SUPABASE_URL, env.SUPABASE_SERVICE_ROLE_KEY, {
    auth: { persistSession: false },
  });
  const anon = createClient(env.SUPABASE_URL, env.VITE_SUPABASE_ANON_KEY, {
    auth: { persistSession: false },
  });
  const password = process.env.DEMO_PASSWORD?.trim() || "TipGuardDemo2026!";

  const loginRes = await anon.auth.signInWithPassword({
    email: "demo-merchant@tipguard.staging",
    password,
  });
  record(
    "8/13 API: merchant auth",
    !loginRes.error && !!loginRes.data.session,
    loginRes.error?.message ?? loginRes.data.user?.id ?? "ok",
  );

  const { data: merch } = await anon
    .from("merchants")
    .select("id,business_name,verified")
    .eq("user_id", MERCHANT_UID)
    .maybeSingle();
  record("3 API: merchant venue row", !!merch?.id, merch?.business_name ?? "missing");

  const { data: qrList } = await admin
    .from("qr_codes")
    .select("code_token,guard_id,revoked_at")
    .eq("guard_id", GUARD_ID)
    .is("revoked_at", null)
    .limit(3);
  record(
    "4 API: QR records exist",
    (qrList?.length ?? 0) > 0,
    `${qrList?.length ?? 0} active codes for demo guard`,
  );

  const { data: resolve } = await anon.rpc("resolve_tip_target", { p_token: DEMO_QR });
  record(
    "5 API: QR resolve",
    Array.isArray(resolve) && resolve.length > 0,
    JSON.stringify(resolve?.[0] ?? null).slice(0, 80),
  );

  const nfcRes = await fetch(`${APP}/nfc/${DEMO_QR}`, { redirect: "manual" });
  record(
    "6 API: NFC route",
    nfcRes.status === 200 || nfcRes.status === 307 || nfcRes.status === 302,
    `HTTP ${nfcRes.status}`,
  );

  const { data: anonS } = await anon.auth.signInAnonymously();
  const jwt = anonS.session?.access_token;
  const initRes = jwt
    ? await fetch(`${env.SUPABASE_URL.replace(/\/$/, "")}/functions/v1/paystack-initialize`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${jwt}`,
          apikey: env.VITE_SUPABASE_ANON_KEY,
        },
        body: JSON.stringify({ kind: "tip", guard_id: GUARD_ID, amount_cents: 2100 }),
      })
    : null;
  const initBody = initRes ? await initRes.text() : "";
  record(
    "8 API: paystack-initialize",
    initRes?.ok === true && initBody.includes("authorization_url"),
    `${initRes?.status ?? "no jwt"} ${initBody.slice(0, 80)}`,
  );

  const webhookRes = await fetch(
    `${env.SUPABASE_URL.replace(/\/$/, "")}/functions/v1/paystack-webhook`,
    { method: "POST", headers: { "Content-Type": "application/json" }, body: "{}" },
  );
  record("11 API: webhook endpoint", webhookRes.status === 400, `HTTP ${webhookRes.status}`);

  const { data: recentTips } = await admin
    .from("tips")
    .select("id,status,amount_cents,guard_id,created_at")
    .eq("guard_id", GUARD_ID)
    .order("created_at", { ascending: false })
    .limit(5);
  const hasPaid = (recentTips ?? []).some((t) => t.status === "paid" || t.status === "completed");
  record(
    "12 API: tips in database",
    (recentTips?.length ?? 0) > 0,
    `${recentTips?.length ?? 0} recent; paid/completed=${hasPaid}`,
  );

  const { data: guard } = await admin
    .from("guards")
    .select("id,display_name,lifetime_tips_cents")
    .eq("id", GUARD_ID)
    .maybeSingle();
  record(
    "14 API: guard earnings field",
    guard?.id != null,
    `lifetime_tips_cents=${(guard as { lifetime_tips_cents?: number })?.lifetime_tips_cents ?? "n/a"}`,
  );

  const successPage = await fetch(`${APP}/payment/success?ref=test&ref_kind=tip`);
  record("10 API: payment success route", successPage.ok, `HTTP ${successPage.status}`);

  console.log("\n--- API audit ---");
  const fail = rows.filter((r) => !r.pass);
  for (const r of rows) console.log(`${r.pass ? "PASS" : "FAIL"}\t${r.name}`);
  process.exit(fail.length ? 1 : 0);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
