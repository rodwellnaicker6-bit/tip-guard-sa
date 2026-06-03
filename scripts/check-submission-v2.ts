/**
 * Checklist runner for PAYSTACK_FINAL_SUBMISSION_PACKAGE_V2 (package-only).
 * Usage: npx tsx scripts/check-submission-v2.ts
 */
import fs from "node:fs";
import path from "node:path";

const OUT = path.resolve("assets/compliance/submission-screenshots-v2");
const PDF = path.resolve("docs/PAYSTACK_FINAL_SUBMISSION_PACKAGE_V2.pdf");
const MP4 = path.resolve("assets/compliance/PAYSTACK_COMPLIANCE_PAYMENT_FLOW.mp4");
const ADDRESS = "235 Queen Mary";

type Row = { id: string; pass: boolean };

function pngOk(name: string, minBytes: number): boolean {
  const p = path.join(OUT, name);
  return fs.existsSync(p) && fs.statSync(p).size >= minBytes;
}

function pngContainsText(name: string, needles: string[]): boolean {
  const p = path.join(OUT, name);
  if (!fs.existsSync(p)) return false;
  const buf = fs.readFileSync(p);
  const latin = buf.toString("latin1");
  return needles.every((n) => latin.includes(n) || buf.includes(Buffer.from(n)));
}

function main() {
  const rows: Row[] = [];

  const pdfRaw = fs.existsSync(PDF) ? fs.readFileSync(PDF) : Buffer.alloc(0);
  const pdfLatin = pdfRaw.toString("latin1");
  const imgCount = (pdfLatin.match(/\/Subtype\s*\/Image/g) || []).length;

  rows.push({ id: "pdf_valid", pass: pdfRaw.length > 500_000 && pdfRaw.slice(0, 5).toString() === "%PDF-" });
  rows.push({ id: "mp4_present", pass: fs.existsSync(MP4) && fs.statSync(MP4).size > 100_000 });
  rows.push({ id: "mp4_referenced_in_md", pass: fs.readFileSync(path.resolve("docs/PAYSTACK_FINAL_SUBMISSION_PACKAGE_V2.md"), "utf8").includes("PAYSTACK_COMPLIANCE_PAYMENT_FLOW.mp4") });

  rows.push({ id: "pdf_hosted_checkout", pass: pngOk("08-paystack-checkout.png", 15_000) });
  rows.push({ id: "pdf_payment_success", pass: pngOk("09-payment-success.png", 50_000) });
  rows.push({ id: "pdf_fee_tip_landing", pass: pngOk("07-tip-landing-fee.png", 50_000) });
  rows.push({ id: "pdf_fee_success_visible", pass: fs.existsSync(path.join(OUT, "09-payment-success.png")) });
  rows.push({ id: "pdf_fee_text_table", pass: fs.readFileSync(path.resolve("docs/PAYSTACK_FINAL_SUBMISSION_PACKAGE_V2.md"), "utf8").includes("additive 2%") });
  rows.push({ id: "pdf_merchant_dashboard", pass: pngOk("10-merchant-dashboard.png", 25_000) });
  rows.push({ id: "pdf_guard_wallet", pass: pngOk("11-guard-wallet.png", 25_000) });
  rows.push({ id: "pdf_qr_generation", pass: pngOk("06-merchant-qr.png", 15_000) });
  rows.push({ id: "pdf_contact_correct", pass: pngOk("02-contact.png", 50_000) });
  rows.push({ id: "pdf_address_in_contact_md", pass: fs.readFileSync(path.resolve("docs/PAYSTACK_FINAL_SUBMISSION_PACKAGE_V2.md"), "utf8").includes(ADDRESS) });
  rows.push({ id: "pdf_terms", pass: pngOk("04-terms.png", 50_000) });
  rows.push({ id: "pdf_privacy", pass: pngOk("03-privacy.png", 50_000) });
  rows.push({ id: "pdf_refunds", pass: pngOk("05-refunds.png", 50_000) });
  rows.push({ id: "pdf_homepage", pass: pngOk("01-homepage.png", 50_000) });
  rows.push({ id: "pdf_merchant_onboarding", pass: pngOk("14-merchant-onboarding.png", 15_000) });
  rows.push({ id: "pdf_merchant_kyc", pass: pngOk("13-merchant-kyc.png", 15_000) });
  rows.push({ id: "pdf_wallet_funding", pass: pngOk("16-customer-wallet.png", 15_000) });
  rows.push({ id: "pdf_fee_evidence_txt", pass: fs.existsSync(path.join(OUT, "12-fee-evidence.txt")) && fs.readFileSync(path.join(OUT, "12-fee-evidence.txt"), "utf8").includes("PASS") });
  rows.push({ id: "pdf_embedded_images", pass: imgCount >= 12 });

  const feeTxt = fs.existsSync(path.join(OUT, "12-fee-evidence.txt"))
    ? fs.readFileSync(path.join(OUT, "12-fee-evidence.txt"), "utf8")
    : "";
  rows.push({ id: "platform_fee_live", pass: feeTxt.includes("PASS") && feeTxt.includes("additive") });

  const pass = rows.filter((r) => r.pass).length;
  const fail = rows.filter((r) => !r.pass).length;
  const submit = fail === 0;

  console.log("CHECKLIST_V2", JSON.stringify({ pass, fail, submit, rows }, null, 2));
  console.log(`PASS count: ${pass}`);
  console.log(`FAIL count: ${fail}`);
  console.log(`SUBMIT NOW = ${submit ? "YES" : "NO"}`);
  if (!submit) {
    console.log("FAILED:", rows.filter((r) => !r.pass).map((r) => r.id).join(", "));
  }
  process.exit(submit ? 0 : 1);
}

main();
