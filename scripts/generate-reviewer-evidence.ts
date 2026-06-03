/**
 * Copy submission V2 screenshots + index for Paystack reviewer walkthrough.
 * Run after: npm run generate:submission-v2
 */
import fs from "node:fs";
import path from "node:path";

const SRC = path.resolve("assets/compliance/submission-screenshots-v2");
const DEST = path.resolve("assets/compliance/reviewer-evidence");
const INDEX = path.join(DEST, "README.md");

const FILES: { file: string; caption: string }[] = [
  { file: "14-merchant-onboarding.png", caption: "New merchant: venue setup wizard (step 1)" },
  { file: "13-merchant-kyc.png", caption: "Merchant KYC self-attestation form" },
  { file: "10-merchant-dashboard.png", caption: "Merchant venue dashboard" },
  { file: "06-merchant-qr.png", caption: "QR code management" },
  { file: "07-tip-landing-fee.png", caption: "Customer tip landing with 2% platform fee" },
  { file: "08-paystack-checkout.png", caption: "Paystack hosted checkout" },
  { file: "09-payment-success.png", caption: "Payment success with fee breakdown" },
  { file: "11-guard-wallet.png", caption: "Guard wallet (tip receipt / payout)" },
  { file: "16-customer-wallet.png", caption: "Customer wallet top-up" },
  { file: "02-contact.png", caption: "Contact — Durban address" },
  { file: "04-terms.png", caption: "Terms of use" },
  { file: "03-privacy.png", caption: "Privacy policy" },
  { file: "05-refunds.png", caption: "Refund policy" },
];

function main() {
  fs.mkdirSync(DEST, { recursive: true });
  const lines = [
    "# Paystack reviewer evidence",
    "",
    `Generated: ${new Date().toISOString()}`,
    "",
    "Walkthrough order:",
    "1. Merchant signup → `/merchant/setup` (screenshot 14)",
    "2. KYC → `/merchant/kyc` (13)",
    "3. Dashboard → `/merchant` (10)",
    "4. QR → `/merchant/qr` (06)",
    "5. Customer tip → hosted checkout → success (07–09)",
    "6. Guard wallet (11) · Customer wallet (16)",
    "7. Legal pages (02–05)",
    "",
    "Video: `assets/compliance/PAYSTACK_COMPLIANCE_PAYMENT_FLOW.mp4`",
    "",
    "## Screenshots",
    "",
  ];

  for (const { file, caption } of FILES) {
    const src = path.join(SRC, file);
    const dest = path.join(DEST, file);
    if (!fs.existsSync(src)) {
      console.warn("MISSING", file);
      lines.push(`- **${file}** — _missing_ (${caption})`);
      continue;
    }
    fs.copyFileSync(src, dest);
    lines.push(`- [${file}](./${file}) — ${caption}`);
    console.log("OK", file);
  }

  const pdf = path.resolve("docs/PAYSTACK_FINAL_SUBMISSION_PACKAGE_V2.pdf");
  if (fs.existsSync(pdf)) {
    const pdfDest = path.join(DEST, "PAYSTACK_FINAL_SUBMISSION_PACKAGE_V2.pdf");
    fs.copyFileSync(pdf, pdfDest);
    lines.push("", `PDF package: [PAYSTACK_FINAL_SUBMISSION_PACKAGE_V2.pdf](./PAYSTACK_FINAL_SUBMISSION_PACKAGE_V2.pdf)`);
  }

  fs.writeFileSync(INDEX, lines.join("\n"));
  console.log("INDEX", INDEX);
}

main();
