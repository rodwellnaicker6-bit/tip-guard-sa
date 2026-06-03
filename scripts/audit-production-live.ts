/**
 * Live production UX audit (https://tipguardsa.co.za).
 * Usage: npx tsx scripts/audit-production-live.ts
 */
import { chromium } from "playwright";

const BASE = process.env.COMPLIANCE_BASE_URL?.trim() || "https://tipguardsa.co.za";
const PASSWORD = process.env.DEMO_PASSWORD?.trim() || "TipGuardDemo2026!";

type Row = { id: string; pass: boolean; evidence: string };

async function main() {
  const rows: Row[] = [];
  const browser = await chromium.launch({ headless: true });

  const mobileCtx = await browser.newContext({
    viewport: { width: 390, height: 844 },
    isMobile: true,
  });
  const mobile = await mobileCtx.newPage();

  async function bodyText() {
    return mobile.locator("body").innerText();
  }

  await mobile.goto(`${BASE}/`, { waitUntil: "domcontentloaded", timeout: 60_000 });
  await mobile.waitForTimeout(2500);
  let t = await bodyText();
  rows.push({
    id: "mobile_landing_no_test_banner",
    pass: !/Paystack test mode/i.test(t),
    evidence: /Paystack test mode/i.test(t) ? "Visible on /" : "Not visible",
  });
  rows.push({
    id: "mobile_landing_no_build_badge",
    pass: !/build:\d{6,}/i.test(t),
    evidence: (t.match(/build:\d+/) ?? ["none"])[0],
  });

  await mobile.goto(`${BASE}/contact`, { waitUntil: "domcontentloaded", timeout: 60_000 });
  await mobile.waitForTimeout(2000);
  t = await bodyText();
  rows.push({
    id: "contact_address",
    pass: t.includes("235 Queen Mary"),
    evidence: t.includes("235 Queen Mary") ? "235 Queen Mary Avenue" : "Missing on /contact",
  });

  await mobile.goto(`${BASE}/tip/demo-staging-qr-01?amount=10`, { waitUntil: "domcontentloaded", timeout: 60_000 });
  await mobile.waitForTimeout(3000);
  t = await bodyText();
  rows.push({
    id: "qr_tip_fee",
    pass: /Platform [Ff]ee|2%|10\.20|R\s*10\.20/i.test(t),
    evidence: t.replace(/\s+/g, " ").slice(0, 200),
  });

  await mobile.goto(`${BASE}/login`, { waitUntil: "domcontentloaded" });
  await mobile.getByPlaceholder(/email/i).fill("demo-merchant@tipguard.staging");
  await mobile.getByPlaceholder(/password/i).fill(PASSWORD);
  await mobile.getByRole("button", { name: /^continue$/i }).click();
  try {
    await mobile.waitForURL(/\/merchant/, { timeout: 120_000 });
    t = await bodyText();
    rows.push({
      id: "merchant_dashboard",
      pass: /Tips|volume|Venue|QR/i.test(t) && !/Paystack test mode/i.test(t),
      evidence: /Paystack test mode/i.test(t) ? "Test banner on merchant" : "Hub loaded",
    });
    await mobile.goto(`${BASE}/merchant/kyc`, { waitUntil: "domcontentloaded", timeout: 60_000 });
    await mobile.waitForTimeout(3000);
    t = await bodyText();
    rows.push({
      id: "merchant_kyc",
      pass: /Venue verification|Submit for review/i.test(t) && !/migrations not applied/i.test(t),
      evidence: /migrations not applied/i.test(t) ? "False migration error" : (t.match(/Venue verification|Draft/) ?? ["missing"])[0],
    });
  } catch (e) {
    rows.push({
      id: "merchant_dashboard",
      pass: false,
      evidence: e instanceof Error ? e.message.slice(0, 120) : String(e),
    });
    rows.push({ id: "merchant_kyc", pass: false, evidence: "Skipped — login failed" });
  }

  const desktopCtx = await browser.newContext({ viewport: { width: 1280, height: 800 } });
  const desktop = await desktopCtx.newPage();
  await desktop.goto(`${BASE}/`, { waitUntil: "domcontentloaded" });
  const theme = await desktop.evaluate(
    () => document.querySelector('meta[name="theme-color"]')?.getAttribute("content") ?? "",
  );
  rows.push({
    id: "desktop_theme_meta",
    pass: theme === "#0a0f1a",
    evidence: `theme-color=${theme}`,
  });

  await desktop.goto(`${BASE}/payment/success`, { waitUntil: "domcontentloaded" });
  await desktop.waitForTimeout(2000);
  t = await desktop.locator("body").innerText();
  rows.push({
    id: "payment_success_route",
    pass: /payment|confirm|Paystack/i.test(t),
    evidence: t.replace(/\s+/g, " ").slice(0, 100),
  });

  await desktop.goto(`${BASE}/payment/failure?reason=cancelled`, { waitUntil: "domcontentloaded" });
  await desktop.waitForTimeout(2000);
  t = await desktop.locator("body").innerText();
  rows.push({
    id: "payment_failure_route",
    pass: /payment|cancel|failed|try/i.test(t),
    evidence: t.replace(/\s+/g, " ").slice(0, 100),
  });

  await desktop.goto(`${BASE}/login`);
  await desktop.getByPlaceholder(/email/i).fill("demo-customer@tipguard.staging");
  await desktop.getByPlaceholder(/password/i).fill(PASSWORD);
  await desktop.getByRole("button", { name: /^continue$/i }).click();
  try {
    await desktop.waitForURL(/customer/, { timeout: 120_000 });
    await desktop.goto(`${BASE}/customer/wallet`, { waitUntil: "domcontentloaded", timeout: 60_000 });
    await desktop.waitForTimeout(2500);
    t = await desktop.locator("body").innerText();
    rows.push({
      id: "customer_wallet",
      pass: /wallet|balance|Add funds|Deposit/i.test(t),
      evidence: t.replace(/\s+/g, " ").slice(0, 120),
    });
  } catch (e) {
    rows.push({
      id: "customer_wallet",
      pass: false,
      evidence: e instanceof Error ? e.message.slice(0, 120) : String(e),
    });
  }

  await browser.close();

  for (const r of rows) {
    console.log(r.pass ? "PASS" : "FAIL", r.id, "—", r.evidence);
  }
  const fail = rows.filter((r) => !r.pass).length;
  console.log(`\nLIVE_UX ${rows.length - fail}/${rows.length} pass`);
  process.exit(fail > 0 ? 1 : 0);
}

main().catch((e) => {
  console.error(e);
  process.exit(2);
});
