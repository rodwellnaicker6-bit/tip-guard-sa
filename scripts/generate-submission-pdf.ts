/** Generate docs/PAYSTACK_FINAL_SUBMISSION_PACKAGE.pdf via Playwright. */
import fs from "node:fs";
import path from "node:path";
import { chromium } from "playwright";
import { marked } from "marked";

const mdPath = path.resolve("docs/PAYSTACK_FINAL_SUBMISSION_PACKAGE.md");
const outPath = path.resolve("docs/PAYSTACK_FINAL_SUBMISSION_PACKAGE.pdf");

async function main() {
  const md = fs.readFileSync(mdPath, "utf8");
  const html = `<!DOCTYPE html><html><head><meta charset="utf-8"><style>
    body{font-family:system-ui,sans-serif;max-width:800px;margin:2rem auto;line-height:1.5;color:#111}
    table{border-collapse:collapse;width:100%;margin:1rem 0} th,td{border:1px solid #ccc;padding:8px;text-align:left}
    h1{font-size:1.4rem} h2{font-size:1.1rem;margin-top:1.5rem}
  </style></head><body>${marked.parse(md)}</body></html>`;
  const browser = await chromium.launch({ headless: true });
  const page = await browser.newPage();
  await page.setContent(html, { waitUntil: "networkidle" });
  await page.pdf({ path: outPath, format: "A4", printBackground: true });
  await browser.close();
  console.log("Wrote", outPath, fs.statSync(outPath).size, "bytes");
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
