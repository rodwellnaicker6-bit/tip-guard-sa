/**
 * Paystack compliance lockdown — production evidence runner.
 * Usage: npx tsx scripts/compliance-lockdown-verify.ts
 */
import fs from "node:fs";
import path from "node:path";
import { execSync } from "node:child_process";
import { createClient } from "@supabase/supabase-js";
import { loadEnvFiles, requireEnv } from "./lib/env.js";

const APP = process.env.COMPLIANCE_BASE_URL?.trim() || "https://tipguardsa.co.za";
const GUARD_ID = "b1000003-0003-4003-8003-000000000003";
const DEMO_QR = "demo-staging-qr-01";
const EVIDENCE_DIR = path.resolve("assets/compliance/lockdown-evidence");

type Step = { id: string; pass: boolean; detail: string };

const steps: Step[] = [];
function step(id: string, pass: boolean, detail: string) {
  steps.push({ id, pass, detail });
  console.log(pass ? "PASS" : "FAIL", id, detail);
}

async function main() {
  fs.mkdirSync(EVIDENCE_DIR, { recursive: true });
  loadEnvFiles();
  const env = requireEnv([
    "SUPABASE_URL",
    "VITE_SUPABASE_ANON_KEY",
    "PAYSTACK_SECRET_KEY",
  ]);

  const routes = [
    { name: "home", url: `${APP}/` },
    { name: "contact", url: `${APP}/contact` },
    { name: "terms", url: `${APP}/terms` },
    { name: "privacy", url: `${APP}/privacy` },
    { name: "refunds", url: `${APP}/legal/refunds` },
    { name: "tip", url: `${APP}/tip/${DEMO_QR}` },
  ];

  for (const r of routes) {
    const res = await fetch(r.url, { redirect: "follow" });
    step(`http_${r.name}`, res.ok && res.url.startsWith("https://"), `${res.status} ${res.url}`);
  }

  const homeRes = await fetch(`${APP}/`);
  const homeHtml = await homeRes.text();
  const mixedHttpAsset = /(?:src|href)=["']http:\/\/(?!www\.w3\.org)/i.test(homeHtml);
  step("ssl_no_mixed_content_index", !mixedHttpAsset, mixedHttpAsset ? "http asset in index" : "no insecure assets");

  const h = await fetch(APP, { method: "HEAD" });
  const hsts = h.headers.get("strict-transport-security");
  step("ssl_hsts", Boolean(hsts?.includes("max-age")), hsts ?? "missing");

  const cert = execSync(
    `echo | openssl s_client -connect tipguardsa.co.za:443 -servername tipguardsa.co.za 2>/dev/null | openssl x509 -noout -subject -dates 2>/dev/null`,
    { encoding: "utf8" },
  ).trim();
  fs.writeFileSync(path.join(EVIDENCE_DIR, "ssl-cert.txt"), cert);
  step("ssl_cert_valid", cert.includes("subject="), cert.split("\n")[0] ?? "no cert");

  const mp4 = path.resolve("assets/compliance/PAYSTACK_COMPLIANCE_PAYMENT_FLOW.mp4");
  const mp4Ok = fs.existsSync(mp4) && fs.statSync(mp4).size > 100_000;
  let dur = 0;
  if (mp4Ok) {
    dur = Number(
      execSync(
        `ffprobe -v error -show_entries format=duration -of default=noprint_wrappers=1:nokey=1 "${mp4}"`,
        { encoding: "utf8" },
      ).trim(),
    );
  }
  step("video_mp4_exists", mp4Ok, mp4Ok ? `${(fs.statSync(mp4).size / 1e6).toFixed(1)}MB ${dur.toFixed(0)}s` : "missing");

  const base = env.SUPABASE_URL.replace(/\/$/, "");
  const anon = createClient(env.SUPABASE_URL, env.VITE_SUPABASE_ANON_KEY, {
    auth: { persistSession: false },
  });
  const { data: anonData, error: anonErr } = await anon.auth.signInAnonymously();
  step("payment_anon_auth", !anonErr && Boolean(anonData?.session), anonErr?.message ?? "ok");

  if (anonData?.session) {
    const jwt = anonData.session.access_token;
    const initRes = await fetch(`${base}/functions/v1/paystack-initialize`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${jwt}`,
        apikey: env.VITE_SUPABASE_ANON_KEY,
      },
      body: JSON.stringify({ kind: "tip", guard_id: GUARD_ID, amount_cents: 1000 }),
    });
    const initJson = (await initRes.json()) as {
      reference?: string;
      callback_url?: string;
      authorization_url?: string;
      error?: string;
    };
    const cbOk = Boolean(initJson.callback_url?.includes("tipguardsa.co.za/payment/success"));
    const paystackOk = Boolean(initJson.authorization_url?.includes("paystack"));
    const noMarketplace = !JSON.stringify(initJson).match(/amazon|ebay|takealot/i);
    step("payment_callback_url", cbOk, initJson.callback_url ?? "MISSING");
    step("payment_paystack_hosted", paystackOk, initJson.authorization_url?.slice(0, 60) ?? "MISSING");
    step("payment_no_marketplace", Boolean(noMarketplace), "TipGuard + Paystack only");

    if (initJson.reference) {
      const verifyRes = await fetch(
        `https://api.paystack.co/transaction/verify/${encodeURIComponent(initJson.reference)}`,
        { headers: { Authorization: `Bearer ${env.PAYSTACK_SECRET_KEY}` } },
      );
      const verifyJson = (await verifyRes.json()) as { data?: { status?: string } };
      step("paystack_api_reachable", verifyRes.ok, verifyJson.data?.status ?? String(verifyRes.status));
    }
  }

  const webhookProbe = await fetch(`${base}/functions/v1/paystack-webhook`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: "{}",
  });
  step("webhook_endpoint_live", webhookProbe.status === 401 || webhookProbe.status === 400, `status ${webhookProbe.status}`);

  const report = {
    generatedAt: new Date().toISOString(),
    app: APP,
    steps,
    passCount: steps.filter((s) => s.pass).length,
    total: steps.length,
  };
  fs.writeFileSync(path.join(EVIDENCE_DIR, "lockdown-report.json"), JSON.stringify(report, null, 2));
  console.log("\nEvidence:", path.join(EVIDENCE_DIR, "lockdown-report.json"));
  const failed = steps.filter((s) => !s.pass);
  if (failed.length) {
    console.error("FAILED:", failed.map((f) => f.id).join(", "));
    process.exit(1);
  }
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
