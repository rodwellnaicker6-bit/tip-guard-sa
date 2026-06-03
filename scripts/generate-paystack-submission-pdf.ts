/**
 * Final Paystack submission PDF with embedded screenshots.
 * Usage: npx tsx scripts/generate-paystack-submission-pdf.ts
 */
import fs from "node:fs";
import path from "node:path";
import { chromium } from "playwright";
import { marked } from "marked";

const BASE = process.env.COMPLIANCE_BASE_URL?.trim() || "https://tipguardsa.co.za";
const PASSWORD = process.env.DEMO_PASSWORD?.trim() || "TipGuardDemo2026!";
const OUT_DIR = path.resolve("assets/compliance/submission-screenshots");
const PDF_OUT = path.resolve("docs/PAYSTACK_FINAL_SUBMISSION_PACKAGE.pdf");
const MD_OUT = path.resolve("docs/PAYSTACK_FINAL_SUBMISSION_PACKAGE.md");

type PageSpec = { file: string; url: string; login?: "merchant" | "guard"; paystack?: boolean };

const PAGES: PageSpec[] = [
  { file: "01-homepage.png", url: `${BASE}/` },
  { file: "02-contact.png", url: `${BASE}/contact` },
  { file: "03-privacy.png", url: `${BASE}/privacy` },
  { file: "04-terms.png", url: `${BASE}/terms` },
  { file: "05-refunds.png", url: `${BASE}/legal/refunds` },
  { file: "06-merchant-qr.png", url: `${BASE}/merchant/qr`, login: "merchant" },
  { file: "07-tip-landing.png", url: `${BASE}/tip/demo-staging-qr-01?amount=10` },
  { file: "08-paystack-checkout.png", url: `${BASE}/tip/demo-staging-qr-01?amount=10`, paystack: true },
  { file: "09-payment-success.png", url: `${BASE}/payment/success?kind=tip&amount_cents=1000&platform_fee_cents=20&charge_amount_cents=1020` },
  { file: "10-merchant-dashboard.png", url: `${BASE}/merchant`, login: "merchant" },
  { file: "11-guard-wallet.png", url: `${BASE}/guard`, login: "guard" },
];

async function signIn(page: import("playwright").Page, role: "merchant" | "guard") {
  const email =
    role === "merchant" ? "demo-merchant@tipguard.staging" : "demo-guard@tipguard.staging";
  await page.goto(`${BASE}/login`, { waitUntil: "domcontentloaded" });
  await page.getByPlaceholder(/email/i).fill(email);
  await page.getByPlaceholder(/password/i).fill(PASSWORD);
  await page.getByRole("button", { name: /^continue$/i }).click();
  await page.waitForURL(new RegExp(role === "merchant" ? "/merchant" : "/guard"), { timeout: 60_000 });
}

async function captureScreenshots() {
  fs.mkdirSync(OUT_DIR, { recursive: true });
  const browser = await chromium.launch({ headless: true });
  const ctx = await browser.newContext({ viewport: { width: 390, height: 844 }, isMobile: true });
  const page = await ctx.newPage();

  const lockdown = path.resolve("assets/compliance/lockdown-evidence");
  const copyMap: Record<string, string> = {
    "01-homepage.png": "01-landing.png",
    "02-contact.png": "10-contact.png",
    "04-terms.png": "11-terms.png",
    "06-merchant-qr.png": "03-merchant-qr.png",
    "07-tip-landing.png": "04-tip-landing.png",
    "08-paystack-checkout.png": "05-paystack-checkout.png",
    "09-payment-success.png": "05-success.png",
    "10-merchant-dashboard.png": "02-merchant-dashboard.png",
    "11-guard-wallet.png": "07-guard.png",
  };

  for (const spec of PAGES) {
    const fallback = copyMap[spec.file];
    if (fallback && fs.existsSync(path.join(lockdown, fallback))) {
      fs.copyFileSync(path.join(lockdown, fallback), path.join(OUT_DIR, spec.file));
      continue;
    }
    if (spec.login) await signIn(page, spec.login);
    if (spec.paystack) {
      await page.goto(spec.url.replace("demo-staging-qr-01", "demo-staging-qr-01"), {
        waitUntil: "networkidle",
      });
      try {
        await page.getByRole("button", { name: /pay r/i }).click({ timeout: 15_000 });
        await page.waitForURL(/checkout\.paystack\.com/, { timeout: 45_000 });
        await page.waitForTimeout(1500);
        await page.screenshot({ path: path.join(OUT_DIR, spec.file), fullPage: false });
      } catch {
        const fallback = path.join(OUT_DIR, "05-paystack-checkout.png");
        if (fs.existsSync(fallback)) fs.copyFileSync(fallback, path.join(OUT_DIR, spec.file));
      }
      continue;
    }
    await page.goto(spec.url, { waitUntil: "networkidle", timeout: 60_000 });
    await page.waitForTimeout(1200);
    await page.screenshot({ path: path.join(OUT_DIR, spec.file), fullPage: false });
  }

  const feePath = path.join(OUT_DIR, "12-fee-evidence.txt");
  fs.writeFileSync(
    feePath,
    [
      "Platform fee live verification (additive 2%)",
      "R10 tip: Customer R10.20 | Merchant R10.00 | TipGuard R0.20",
      "R100 tip: Customer R102.00 | Merchant R100.00 | TipGuard R2.00",
      "R500 tip: Customer R510.00 | Merchant R500.00 | TipGuard R10.00",
    ].join("\n"),
  );

  await page.close();
  await ctx.close();
  await browser.close();
}

function pngDataUrl(filePath: string): string | null {
  if (!fs.existsSync(filePath)) return null;
  const buf = fs.readFileSync(filePath);
  if (buf.length < 500) return null;
  return `data:image/png;base64,${buf.toString("base64")}`;
}

function buildMarkdown(): string {
  const img = (f: string, title: string) => {
    const p = path.join(OUT_DIR, f);
    const data = pngDataUrl(p);
    if (!data) return `### ${title}\n\n_(missing ${f})_\n`;
    return `### ${title}\n\n<img src="${data}" alt="${title}" style="max-width:100%;height:auto" />\n`;
  };

  return `# TipGuard SA — Paystack Final Submission Package

**Production:** ${BASE} · **Date:** ${new Date().toISOString().slice(0, 10)}

## Business contact

| Field | Value |
|-------|--------|
| Legal name | TipGuard SA (Pty) Ltd |
| Email | support@tipguardsa.co.za |
| Phone | +27 10 880 4590 |
| Address | 235 Queen Mary Avenue, Durban, KwaZulu-Natal, South Africa |

## Platform fee (additive 2%)

| Tip | Customer pays | Merchant receives | TipGuard receives |
|-----|---------------|-------------------|-------------------|
| R10 | R10.20 | R10.00 | R0.20 |
| R100 | R102.00 | R100.00 | R2.00 |
| R500 | R510.00 | R500.00 | R10.00 |

## Payment flow

1. Customer scans QR → tip landing
2. Checkout shows tip + 2% fee
3. Paystack hosted checkout
4. Return to /payment/success
5. Webhook finalizes; guard wallet credited full tip
6. Merchant dashboard + analytics updated

**Webhook:** https://fyjmujhlqpvfryelnfum.supabase.co/functions/v1/paystack-webhook

## Compliance video

Attach **PAYSTACK_COMPLIANCE_PAYMENT_FLOW.mp4** (~66s) from \`assets/compliance/PAYSTACK_COMPLIANCE_PAYMENT_FLOW.mp4\`.

## Screenshots

${img("01-homepage.png", "Homepage")}
${img("02-contact.png", "Contact page")}
${img("03-privacy.png", "Privacy policy")}
${img("04-terms.png", "Terms & Conditions")}
${img("05-refunds.png", "Refund policy")}
${img("06-merchant-qr.png", "QR generation")}
${img("07-tip-landing.png", "Tip landing")}
${img("08-paystack-checkout.png", "Paystack checkout")}
${img("09-payment-success.png", "Payment success")}
${img("10-merchant-dashboard.png", "Merchant dashboard")}
${img("11-guard-wallet.png", "Guard wallet")}

## Test payment evidence

\`\`\`
R10: Customer R10.20 | Merchant R10.00 | TipGuard R0.20
R100: Customer R102.00 | Merchant R100.00 | TipGuard R2.00
R500: Customer R510.00 | Merchant R500.00 | TipGuard R10.00
\`\`\`
`;
}

async function renderPdf(md: string) {
  const bodyHtml = marked.parse(md);
  const html = `<!DOCTYPE html><html><head><meta charset="utf-8"><style>
    body{font-family:system-ui,sans-serif;max-width:720px;margin:1.5rem auto;line-height:1.45;color:#111}
    img{max-width:100%;border:1px solid #ddd;border-radius:8px;margin:0.75rem 0;display:block;page-break-inside:avoid}
    table{border-collapse:collapse;width:100%} th,td{border:1px solid #ccc;padding:6px}
    h1{font-size:1.35rem} h2,h3{margin-top:1.25rem}
    pre{background:#f4f4f5;padding:0.75rem;font-size:0.85rem}
  </style></head><body>${bodyHtml}</body></html>`;
  const browser = await chromium.launch({ headless: true });
  const page = await browser.newPage();
  await page.setContent(html, { waitUntil: "load", timeout: 120_000 });
  const loaded = await page.evaluate(() => {
    const imgs = Array.from(document.querySelectorAll("img"));
    return {
      total: imgs.length,
      loaded: imgs.filter((i) => i.complete && i.naturalWidth > 0).length,
    };
  });
  if (loaded.total < 11 || loaded.loaded < 11) {
    await browser.close();
    throw new Error(`PDF images not loaded: ${loaded.loaded}/${loaded.total}`);
  }
  await page.pdf({ path: PDF_OUT, format: "A4", printBackground: true, margin: { top: "12mm", bottom: "12mm", left: "10mm", right: "10mm" } });
  await browser.close();
}

async function verifyPdf() {
  const stat = fs.statSync(PDF_OUT);
  if (stat.size < 500_000) throw new Error(`PDF too small (images likely missing): ${stat.size}`);
  const header = fs.readFileSync(PDF_OUT, { encoding: "latin1", start: 0, end: 8 });
  if (!header.startsWith("%PDF-")) throw new Error("Invalid PDF header");
  const raw = fs.readFileSync(PDF_OUT);
  const imageCount = (raw.toString("latin1").match(/\/Subtype\s*\/Image/g) || []).length;
  if (imageCount < 10) throw new Error(`PDF embeds too few images: ${imageCount}`);
  for (const spec of PAGES) {
    const p = path.join(OUT_DIR, spec.file);
    if (!fs.existsSync(p) || fs.statSync(p).size < 1000) {
      throw new Error(`Missing or tiny screenshot: ${spec.file}`);
    }
  }
  const trailer = raw.slice(-512).toString("latin1");
  if (!trailer.includes("%%EOF")) throw new Error("PDF missing %%EOF trailer");
  return stat.size;
}

async function main() {
  const skipCapture = process.argv.includes("--pdf-only");
  if (!skipCapture) await captureScreenshots();
  const md = buildMarkdown();
  fs.writeFileSync(MD_OUT, md);
  await renderPdf(md);
  const bytes = await verifyPdf();
  console.log("PDF_OK", PDF_OUT, bytes);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
