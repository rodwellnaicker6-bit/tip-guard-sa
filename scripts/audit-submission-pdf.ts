/**
 * Audit PAYSTACK_FINAL_SUBMISSION_PACKAGE.pdf content.
 */
import fs from "node:fs";
import path from "node:path";
import { chromium } from "playwright";
import { marked } from "marked";

const MD = path.resolve("docs/PAYSTACK_FINAL_SUBMISSION_PACKAGE.md");
const PDF = path.resolve("docs/PAYSTACK_FINAL_SUBMISSION_PACKAGE.pdf");
const SHOTS = path.resolve("assets/compliance/submission-screenshots");

const REQUIRED_TEXT = [
  "235 Queen Mary Avenue",
  "support@tipguardsa.co.za",
  "+27 10 880 4590",
  "Privacy policy",
  "Terms & Conditions",
  "Refund policy",
  "Payment flow",
  "Platform fee",
  "additive 2%",
  "PAYSTACK_COMPLIANCE_PAYMENT_FLOW.mp4",
  "tipguardsa.co.za",
];

const REQUIRED_IMAGES = [
  "Homepage",
  "Contact page",
  "Privacy policy",
  "Terms & Conditions",
  "Refund policy",
  "QR generation",
  "Tip landing",
  "Paystack checkout",
  "Payment success",
  "Merchant dashboard",
  "Guard wallet",
];

async function main() {
  const checks: Record<string, boolean> = {};
  const raw = fs.readFileSync(PDF);
  checks.pdf_header = raw.slice(0, 5).toString() === "%PDF-";
  checks.pdf_eof = raw.slice(-1024).toString("latin1").includes("%%EOF");
  checks.pdf_size_ok = raw.length >= 500_000;
  const latin = raw.toString("latin1");
  checks.pdf_images_embedded = (latin.match(/\/Subtype\s*\/Image/g) || []).length >= 10;

  const md = fs.readFileSync(MD, "utf8");
  for (const t of REQUIRED_TEXT) checks[`text_${t}`] = md.includes(t);
  checks.no_placeholder = !/(missing |placeholder|TODO|\(missing)/i.test(md);

  const browser = await chromium.launch({ headless: true });
  const page = await browser.newPage();
  const bodyHtml = marked.parse(md);
  await page.setContent(
    `<!DOCTYPE html><html><head><meta charset="utf-8"></head><body>${bodyHtml}</body></html>`,
    { waitUntil: "load", timeout: 120_000 },
  );
  const bodyText = await page.evaluate(() => document.body.innerText);
  for (const t of REQUIRED_TEXT) checks[`rendered_${t}`] = bodyText.includes(t);

  const imgs = await page.evaluate(() =>
    Array.from(document.querySelectorAll("img")).map((img) => ({
      alt: img.getAttribute("alt") || "",
      ok: img.complete && img.naturalWidth > 0,
      w: img.naturalWidth,
      h: img.naturalHeight,
    })),
  );
  await browser.close();

  checks.all_images_load = imgs.length === 11 && imgs.every((i) => i.ok);
  for (const title of REQUIRED_IMAGES) {
    const found = imgs.some((i) => i.alt === title && i.ok);
    checks[`shot_${title}`] = found;
  }

  for (const f of fs.readdirSync(SHOTS).filter((x) => x.endsWith(".png"))) {
    checks[`file_${f}`] = fs.statSync(path.join(SHOTS, f)).size >= 1000;
  }

  const failed = Object.entries(checks).filter(([, v]) => !v).map(([k]) => k);
  console.log(JSON.stringify({ pass: failed.length === 0, failed, imgs }, null, 2));
  process.exit(failed.length === 0 ? 0 : 1);
}

main().catch((e) => {
  console.error(e);
  process.exit(2);
});
