/**
 * Record Paystack compliance payment-flow video (60–90s target).
 * Usage: npx tsx scripts/record-paystack-compliance-video.ts
 *
 * Requires: npx playwright install chromium
 * Output: assets/compliance/PAYSTACK_COMPLIANCE_PAYMENT_FLOW.mp4
 */
import { chromium, type Page } from "playwright";
import fs from "node:fs";
import path from "node:path";
import { execSync } from "node:child_process";
import { loadEnvFiles } from "./lib/env.js";

loadEnvFiles();

function freshQrToken(): string {
  const out = execSync("npx tsx scripts/create-compliance-qr-token.ts", {
    encoding: "utf8",
    cwd: process.cwd(),
  }).trim();
  const match = out.match(/tg_[a-f0-9]{32}/i);
  if (!match) throw new Error(`QR token script failed: ${out}`);
  return match[0];
}

const BASE = process.env.COMPLIANCE_BASE_URL?.trim() || "https://tipguardsa.co.za";
const PASSWORD = process.env.DEMO_PASSWORD?.trim() || "TipGuardDemo2026!";
const OUT_DIR = path.resolve("assets/compliance/video-raw");
const FINAL_MP4 = path.resolve("assets/compliance/PAYSTACK_COMPLIANCE_PAYMENT_FLOW.mp4");
const HOLD_MS = 2_500;

async function hold(page: Page, ms = HOLD_MS) {
  await page.waitForTimeout(ms);
}

async function signInDemo(page: Page, email: string, landing: "/merchant" | "/guard") {
  await page.goto(`${BASE}${landing}`, { waitUntil: "domcontentloaded" });
  if (!page.url().includes("/login")) return;
  await page.getByPlaceholder(/email/i).fill(email);
  await page.getByPlaceholder(/password/i).fill(PASSWORD);
  await page.getByRole("button", { name: /^continue$/i }).click();
  await page.waitForURL(new RegExp(landing.replace("/", "\\/")), { timeout: 60_000 });
  await page.waitForLoadState("networkidle").catch(() => {});
}

async function createFreshQrToken(page: Page): Promise<string> {
  if (!page.url().includes("/merchant/qr")) {
    await page.goto(`${BASE}/merchant/qr`, { waitUntil: "networkidle", timeout: 60_000 });
  }
  await hold(page, 1500);
  await page.locator('select').first().selectOption("guard_staff");
  const label = `compliance-vid-${Date.now().toString(36).slice(-6)}`;
  await page.getByPlaceholder(/label/i).fill(label);
  await page.locator("select").nth(1).selectOption({ index: 1 });
  await page.getByRole("button", { name: /create qr/i }).click();
  await page.waitForTimeout(3000);
  const text = await page.locator("li").first().textContent();
  const match = text?.match(/tg_[a-f0-9]{32}/i);
  if (!match) throw new Error("Could not read new QR token from merchant page");
  return match[0];
}

async function runPaystackTestSuccess(page: Page) {
  await page.getByText(/^Success$/i).first().click({ timeout: 15_000 }).catch(() => {});
  await hold(page, 800);
  const payBtn = page.getByRole("button", { name: /pay zar/i });
  await payBtn.click({ timeout: 10_000 });
}

async function main() {
  fs.mkdirSync(OUT_DIR, { recursive: true });
  const browser = await chromium.launch({ headless: true });
  const context = await browser.newContext({
    recordVideo: { dir: OUT_DIR, size: { width: 1280, height: 720 } },
    viewport: { width: 390, height: 844 },
    isMobile: true,
    userAgent:
      "Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.0 Mobile/15E148 Safari/604.1",
    locale: "en-ZA",
    ignoreHTTPSErrors: false,
  });

  const page = await context.newPage();
  let qrToken = "";

  try {
    qrToken = freshQrToken();
    console.log("QR token:", qrToken);

    console.log("[1/8] QR scan → customer tip landing");
    await context.clearCookies();
    await page.goto(`${BASE}/tip/${qrToken}?amount=10`, { waitUntil: "networkidle" });
    await hold(page);
    await page.screenshot({ path: path.join(OUT_DIR, "02-tip-landing.png") });

    console.log("[2/8] Enter tip amount + Pay");
    await page.getByRole("button", { name: /pay r\s*\d/i }).click();
    await page.waitForURL(/checkout\.paystack\.com/, { timeout: 45_000 });
    await hold(page);

    console.log("[3/8] Paystack hosted checkout — test success");
    await runPaystackTestSuccess(page);

    console.log("[4/8] Automatic return → TipGuard success page");
    await page.waitForURL(/\/payment\/success/, { timeout: 60_000 });
    await hold(page);
    await page.getByRole("heading", { name: /payment confirmed/i }).waitFor({ timeout: 30_000 });
    await hold(page);
    await page.screenshot({ path: path.join(OUT_DIR, "05-success.png") });

    console.log("[5/8] Merchant dashboard update");
    await signInDemo(page, "demo-merchant@tipguard.staging", "/merchant");
    await hold(page, 3500);
    await page.screenshot({ path: path.join(OUT_DIR, "06-merchant.png") });

    console.log("[6/8] Guard wallet balance");
    await signInDemo(page, "demo-guard@tipguard.staging", "/guard");
    await hold(page, 3500);
    await page.screenshot({ path: path.join(OUT_DIR, "07-guard.png") });

    console.log("[7/8] Business contact + policies");
    await page.goto(`${BASE}/contact`, { waitUntil: "networkidle" });
    await hold(page, 2000);
    await page.goto(`${BASE}/legal/refunds`, { waitUntil: "domcontentloaded" });
    await hold(page, 1500);
  } finally {
    await page.close();
    await context.close();
    await browser.close();
  }

  const webms = fs.readdirSync(OUT_DIR).filter((f) => f.endsWith(".webm"));
  if (!webms.length) throw new Error("No video recorded");
  const webmPath = path.join(OUT_DIR, webms[0]!);
  console.log("Raw video:", webmPath);

  try {
    execSync(
      `ffmpeg -y -i "${webmPath}" -t 90 -c:v libx264 -pix_fmt yuv420p -movflags +faststart -an "${FINAL_MP4}"`,
      { stdio: "inherit" },
    );
    const stat = fs.statSync(FINAL_MP4);
    const probe = execSync(
      `ffprobe -v error -show_entries format=duration -of default=noprint_wrappers=1:nokey=1 "${FINAL_MP4}"`,
      { encoding: "utf8" },
    ).trim();
    console.log(`MP4: ${FINAL_MP4} (${(stat.size / 1e6).toFixed(1)} MB, ${Number(probe).toFixed(0)}s)`);
  } catch (e) {
    console.error("ffmpeg missing or failed — copy webm manually:", webmPath);
    fs.copyFileSync(webmPath, FINAL_MP4.replace(".mp4", ".webm"));
    throw e;
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
