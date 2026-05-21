/**
 * Beta checks: Paystack env, webhook reachability, transactions table, auth.
 * Usage: npm run verify:paystack
 */
import { createClient } from "@supabase/supabase-js";
import { createHmac } from "node:crypto";
import { loadEnvFiles } from "./lib/env.js";

loadEnvFiles();

const url = process.env.VITE_SUPABASE_URL?.trim() || process.env.SUPABASE_URL?.trim();
const anon = process.env.VITE_SUPABASE_ANON_KEY?.trim();
const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY?.trim();
const pk = process.env.VITE_PAYSTACK_PUBLIC_KEY?.trim();
const sk = process.env.PAYSTACK_SECRET_KEY?.trim();

let failed = 0;
function pass(m: string) {
  console.log(`✓ ${m}`);
}
function fail(m: string, d?: string) {
  failed++;
  console.error(`✗ ${m}${d ? ` — ${d}` : ""}`);
}
function warn(m: string) {
  console.warn(`⚠ ${m}`);
}

async function main() {
  console.log("TipGuard — Paystack beta verification\n");

  if (!pk?.startsWith("pk_test_") && !pk?.startsWith("pk_live_")) {
    fail("VITE_PAYSTACK_PUBLIC_KEY", "missing or invalid");
  } else {
    pass(`Public key (${pk.startsWith("pk_test_") ? "test" : "live"})`);
  }

  if (!sk?.startsWith("sk_test_") && !sk?.startsWith("sk_live_")) {
    warn("PAYSTACK_SECRET_KEY not in .env — must be set in Supabase Edge secrets for initialize/verify/webhook");
  } else {
    pass(`Secret key in env (${sk.startsWith("sk_test_") ? "test" : "live"}) — deploy to Supabase secrets for Edge`);
    try {
      const res = await fetch("https://api.paystack.co/transaction/totals", {
        headers: { Authorization: `Bearer ${sk}` },
      });
      if (res.ok) pass("Paystack API reachable with secret");
      else fail("Paystack API", `HTTP ${res.status}`);
    } catch (e) {
      fail("Paystack API", (e as Error).message);
    }
  }

  if (!url) {
    fail("SUPABASE_URL missing");
    process.exit(1);
  }

  const webhookUrl = `${url}/functions/v1/paystack-webhook`;
  try {
    const noSig = await fetch(webhookUrl, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ event: "ping", data: { id: 0 } }),
    });
    if (noSig.status === 400) {
      pass(`Webhook endpoint reachable (rejects unsigned: ${webhookUrl})`);
    } else if (noSig.status === 404) {
      fail("Webhook endpoint", "404 — deploy paystack-webhook Edge function");
    } else {
      warn(`Webhook POST without signature returned ${noSig.status} (expected 400)`);
    }

    if (sk) {
      const body = JSON.stringify({ event: "ping.test", data: { id: "beta-check" } });
      const sig = createHmac("sha512", sk).update(body).digest("hex");
      const signed = await fetch(webhookUrl, {
        method: "POST",
        headers: { "Content-Type": "application/json", "x-paystack-signature": sig },
        body,
      });
      if (signed.ok || signed.status === 200) {
        pass("Webhook accepts valid HMAC signature");
      } else {
        warn(`Signed webhook returned ${signed.status} (may need DB RPCs for claim)`);
      }
    }
  } catch (e) {
    fail("Webhook fetch", (e as Error).message);
  }

  const verifyUrl = `${url}/functions/v1/paystack-verify`;
  try {
    const res = await fetch(verifyUrl, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ reference: "tg_probe" }),
    });
    if (res.status === 401) pass("paystack-verify Edge deployed (requires auth JWT)");
    else if (res.status === 400 || res.status === 404) pass(`paystack-verify Edge reachable (HTTP ${res.status})`);
    else warn(`paystack-verify POST → ${res.status}`);
  } catch (e) {
    fail("paystack-verify", (e as Error).message);
  }

  if (serviceKey) {
    const admin = createClient(url, serviceKey, { auth: { persistSession: false } });
    const { count, error } = await admin.from("transactions").select("id", { count: "exact", head: true });
    if (error) fail("transactions table", error.message);
    else pass(`transactions table readable (${count ?? 0} rows)`);

    const { data: recent } = await admin
      .from("transactions")
      .select("status, type, amount_cents, created_at")
      .order("created_at", { ascending: false })
      .limit(3);
    if (recent?.length) {
      pass(`Latest tx: ${recent.map((r) => `${r.status}/${r.type}`).join(", ")}`);
    } else {
      warn("No transactions yet — run a test payment");
    }
  } else {
    warn("SUPABASE_SERVICE_ROLE_KEY missing — skip DB transaction checks");
  }

  if (anon) {
    const client = createClient(url, anon);
    const { error: authErr } = await client.auth.getSession();
    if (authErr) fail("Auth API", authErr.message);
    else pass("Auth API reachable");
  }

  console.log(failed ? `\n${failed} check(s) failed.` : "\nAll Paystack beta checks passed.");
  process.exit(failed > 0 ? 1 : 0);
}

void main();
