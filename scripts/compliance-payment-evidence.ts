/**
 * Capture payment-flow evidence screenshots for Paystack lockdown pack.
 * Usage: npx tsx scripts/compliance-payment-evidence.ts
 */
import { chromium } from "playwright";
import fs from "node:fs";
import path from "node:path";
import { execSync } from "node:child_process";

const BASE = process.env.COMPLIANCE_BASE_URL?.trim() || "https://tipguardsa.co.za";
const PASSWORD = process.env.DEMO_PASSWORD?.trim() || "TipGuardDemo2026!";
const OUT = path.resolve("assets/compliance/lockdown-evidence");
const DEMO_QR = "demo-staging-qr-01";

async function main() {
  fs.mkdirSync(OUT, { recursive: true });
  const token = execSync("npx tsx scripts/create-compliance-qr-token.ts", { encoding: "utf8" }).trim();
  const qr = token.match(/tg_[a-f0-9]{32}/i)?.[0] ?? DEMO_QR;

  const browser = await chromium.launch({ headless: true });
  const ctx = await browser.newContext({
    viewport: { width: 390, height: 844 },
    isMobile: true,
  });
  const page = await ctx.newPage();

  try {
    await page.goto(`${BASE}/`, { waitUntil: "networkidle" });
    await page.screenshot({ path: path.join(OUT, "01-landing.png"), fullPage: false });

    await page.goto(`${BASE}/merchant`, { waitUntil: "domcontentloaded" });
    if (page.url().includes("/login")) {
      await page.getByPlaceholder(/email/i).fill("demo-merchant@tipguard.staging");
      await page.getByPlaceholder(/password/i).fill(PASSWORD);
      await page.getByRole("button", { name: /^continue$/i }).click();
      await page.waitForURL(/\/merchant/, { timeout: 60_000 });
    }
    await page.screenshot({ path: path.join(OUT, "02-merchant-dashboard.png") });

    await page.goto(`${BASE}/merchant/qr`, { waitUntil: "networkidle" });
    await page.screenshot({ path: path.join(OUT, "03-merchant-qr.png") });

    await page.context().clearCookies();
    await page.goto(`${BASE}/tip/${qr}?amount=10`, { waitUntil: "networkidle" });
    await page.screenshot({ path: path.join(OUT, "04-tip-landing.png") });

    await page.getByRole("button", { name: /pay r\s*\d/i }).click();
    await page.waitForURL(/checkout\.paystack\.com/, { timeout: 45_000 });
    await page.screenshot({ path: path.join(OUT, "05-paystack-checkout.png") });

    await page.getByText(/^Success$/i).first().click({ timeout: 15_000 }).catch(() => {});
    await page.waitForTimeout(800);
    await page.getByRole("button", { name: /pay zar/i }).click({ timeout: 15_000 });

    await page.waitForURL(/\/payment\/success/, { timeout: 60_000 });
    await page.getByRole("heading", { name: /payment confirmed/i }).waitFor({ timeout: 30_000 });
    await page.screenshot({ path: path.join(OUT, "06-payment-success.png") });

    const receiptBtn = page.getByRole("button", { name: /download receipt/i });
    if (await receiptBtn.isVisible().catch(() => false)) {
      await page.screenshot({ path: path.join(OUT, "07-receipt-ready.png") });
    }

    await page.goto(`${BASE}/merchant`, { waitUntil: "domcontentloaded" });
    await page.getByPlaceholder(/email/i).fill("demo-merchant@tipguard.staging").catch(() => {});
    if (page.url().includes("/login")) {
      await page.getByPlaceholder(/password/i).fill(PASSWORD);
      await page.getByRole("button", { name: /^continue$/i }).click();
      await page.waitForURL(/\/merchant/, { timeout: 60_000 });
    }
    await page.screenshot({ path: path.join(OUT, "08-merchant-after-payment.png") });

    await page.goto(`${BASE}/guard`, { waitUntil: "domcontentloaded" });
    if (page.url().includes("/login")) {
      await page.getByPlaceholder(/email/i).fill("demo-guard@tipguard.staging");
      await page.getByPlaceholder(/password/i).fill(PASSWORD);
      await page.getByRole("button", { name: /^continue$/i }).click();
      await page.waitForURL(/\/guard/, { timeout: 60_000 });
    }
    await page.screenshot({ path: path.join(OUT, "09-guard-wallet.png") });

    await page.goto(`${BASE}/contact`, { waitUntil: "networkidle" });
    await page.screenshot({ path: path.join(OUT, "10-contact.png") });
  } finally {
    await page.close();
    await ctx.close();
    await browser.close();
  }

  console.log("Evidence saved to", OUT);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
