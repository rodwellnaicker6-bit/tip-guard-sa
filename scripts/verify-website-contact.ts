/** Verify production contact/legal visibility. */
import { chromium } from "playwright";

const BASE = process.env.COMPLIANCE_BASE_URL?.trim() || "https://tipguardsa.co.za";
const REQUIRED = [
  "TipGuard SA",
  "support@tipguardsa.co.za",
  "+27 10 880 4590",
  "235 Queen Mary Avenue",
];

async function main() {
  const browser = await chromium.launch({ headless: true });
  const page = await (await browser.newContext()).newPage();
  const pages = [`${BASE}/`, `${BASE}/contact`, `${BASE}/terms`, `${BASE}/privacy`, `${BASE}/legal/refunds`];
  let ok = true;
  for (const url of pages) {
    await page.goto(url, { waitUntil: "networkidle" });
    const text = await page.locator("body").innerText();
    for (const s of REQUIRED) {
      const hit = text.includes(s);
      console.log(hit ? "PASS" : "FAIL", url, s);
      if (!hit && (url.includes("contact") || url === `${BASE}/`)) ok = false;
    }
    const terms = text.match(/Terms|Privacy|Refund/i);
    console.log(terms ? "PASS" : "FAIL", url, "policy nav");
  }
  await browser.close();
  process.exit(ok ? 0 : 1);
}

main();
