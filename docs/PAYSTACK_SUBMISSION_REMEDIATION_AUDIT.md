# Paystack submission package — remediation audit

**Scope:** Submission artifacts only (`docs/PAYSTACK_FINAL_SUBMISSION_PACKAGE.pdf`, `assets/compliance/submission-screenshots/`, `assets/compliance/PAYSTACK_COMPLIANCE_PAYMENT_FLOW.mp4`, `docs/PAYSTACK_SUBMISSION_EMAIL.md`).  
**Ignores:** Build/deploy status.  
**Live site reference:** https://tipguardsa.co.za (used only to distinguish real failures vs false positives).  
**Audit date:** 1 June 2026

---

## Executive summary

| Metric | Value |
|--------|-------|
| **Submission readiness** | **42%** (8 PASS · 11 FAIL · 2 N/A) |
| **Primary blocker** | PDF generator copies stale `lockdown-evidence/` PNGs instead of fresh production captures |
| **Strongest evidence** | `PAYSTACK_COMPLIANCE_PAYMENT_FLOW.mp4` (~66s) + `npm run compliance:verify` API proofs |
| **Weakest evidence** | PDF merchant/guard/checkout screenshots (empty UI, Cloudflare, wrong address on contact) |

---

## Per-requirement remediation matrix

### 1. Hosted Paystack checkout flow

| Field | Detail |
|-------|--------|
| **Evidence available** | MP4 step 3–4 (`checkout.paystack.com`); `lockdown-report.json` → `payment_paystack_hosted`; `scripts/compliance-lockdown-verify.ts` live probe |
| **Missing evidence** | Valid **screenshot** in PDF (`08-paystack-checkout.png` = Cloudflare “Performing security verification”, not Paystack UI) |
| **Screenshots required** | `paystack-hosted-checkout.png` — full Paystack page showing amount, email/card fields or test “Success”, URL bar `checkout.paystack.com` |
| **URLs** | Start: `https://tipguardsa.co.za/tip/demo-staging-qr-01?amount=10` → click **Pay R10.20** (or total with fee) → redirect |
| **User journey** | Guest/incognito → tip landing → select R10 → Pay → wait for Paystack hosted page (not Cloudflare challenge) → capture before paying |
| **Real failure or false positive?** | **Real failure** in PDF package. **False positive** for product: live flow reaches hosted checkout (compliance script PASS). |

---

### 2. Payment success page

| Field | Detail |
|-------|--------|
| **Evidence available** | MP4 step 4–5 (`/payment/success`, “Payment confirmed”); PDF `09-payment-success.png` (simulated query string); `video-raw/05-success.png` |
| **Missing evidence** | PDF screenshot from a **real** post-payment redirect (with live `ref=tg_…` and confirmation state after webhook) |
| **Screenshots required** | `payment-success-confirmed.png` — heading “Payment confirmed”, Paystack ref, tip amount |
| **URLs** | Only after real test payment: `https://tipguardsa.co.za/payment/success?ref=…&reference=…&kind=tip&amount_cents=…&platform_fee_cents=…&charge_amount_cents=…` |
| **User journey** | Complete Paystack test payment → land on success → wait for “Payment confirmed” → screenshot |
| **Real failure or false positive?** | **Partial real failure**: PDF uses static URL; shows R10 but not a completed verification story. MP4 is acceptable evidence. |

---

### 3. Platform fee breakdown visibility

| Field | Detail |
|-------|--------|
| **Evidence available** | PDF text table (additive 2%); `12-fee-evidence.txt`; `npm run verify:platform-fee` output; callback URL in lockdown report includes `platform_fee_cents=20&charge_amount_cents=1020` |
| **Missing evidence** | Tip landing screenshot with “Platform fee … You pay …”; success page showing “Platform fee (2%)” and “Total paid” lines |
| **Screenshots required** | `tip-landing-fee-breakdown.png`, `payment-success-fee-breakdown.png` |
| **URLs** | `https://tipguardsa.co.za/tip/demo-staging-qr-01?amount=10`; success URL after real payment with fee query params |
| **User journey** | Select R10 → confirm fee line visible above Pay button → pay → on success confirm three lines: tip, fee, total |
| **Real failure or false positive?** | **Real failure** in submission screenshots (captured during “Preparing checkout…”, fee UI hidden). **False positive** for product: `QrTipLanding.tsx` and `PaymentSuccess.tsx` implement fee display. |

---

### 4. Merchant dashboard screenshots

| Field | Detail |
|-------|--------|
| **Evidence available** | MP4 includes merchant step; `video-raw/06-merchant.png` is **onboarding step 1**, not dashboard |
| **Missing evidence** | Populated `/merchant` with venue name, analytics, recent tips, payout panel |
| **Screenshots required** | `merchant-dashboard-loaded.png` |
| **URLs** | `https://tipguardsa.co.za/login` → `https://tipguardsa.co.za/merchant` |
| **User journey** | Sign in `demo-merchant@tipguard.staging` / `TipGuardDemo2026!` → wait until venue data loads (no skeleton-only frame) → screenshot |
| **Real failure or false positive?** | **Real failure** in PDF (`10-merchant-dashboard.png` ~9KB, empty nav only). MP4 does not show real dashboard either. |

---

### 5. Shared wallet / guard wallet screenshots

| Field | Detail |
|-------|--------|
| **Evidence available** | MP4 guard step; PDF `11-guard-wallet.png` (empty); `video-raw/07-guard.png` (empty nav) |
| **Missing evidence** | Guard home with **available balance**, recent tips list, payout section |
| **Screenshots required** | `guard-wallet-balance.png` (and optional `guard-payouts-tab.png`) |
| **URLs** | `https://tipguardsa.co.za/login` → `https://tipguardsa.co.za/guard` |
| **User journey** | Sign in `demo-guard@tipguard.staging` → wait for wallet load after a test tip → capture balance ≥ tip amount |
| **Real failure or false positive?** | **Real failure** in package. No separate “shared wallet” product surface — treat as **guard wallet** only. “Shared wallet” label = **N/A / clarify with Paystack** (not a false positive on code, missing wrong artifact type). |

---

### 6. QR generation workflow screenshots (“AI generation”)

| Field | Detail |
|-------|--------|
| **Evidence available** | `record-paystack-compliance-video.ts` creates QR on `/merchant/qr`; PDF `06-merchant-qr.png` empty |
| **Missing evidence** | Merchant QR admin with token list, create form filled, generated `tg_…` link visible |
| **Screenshots required** | `merchant-qr-create.png`, `merchant-qr-list.png` |
| **URLs** | `https://tipguardsa.co.za/merchant/qr` |
| **User journey** | Merchant login → QR hub → select guard staff + site → label → Create QR → screenshot showing new token URL |
| **Real failure or false positive?** | **Real failure** in PDF. **False positive** if reviewer meant “AI”: no AI generation feature exists — interpret as **QR generation**. |

---

### 7. Contact details consistency (submission package)

| Field | Detail |
|-------|--------|
| **Evidence available** | PDF markdown table: `support@tipguardsa.co.za`, `+27 10 880 4590`; MP4 visits `/contact` |
| **Missing evidence** | PDF **image** `02-contact.png` still shows legacy **15 Alice Lane, Sandton** (copied from `lockdown-evidence/10-contact.png`) |
| **Screenshots required** | Fresh `contact-page.png` matching live operator block |
| **URLs** | `/`, `/contact`, `/terms`, `/privacy`, `/legal/refunds` |
| **User journey** | Capture each page footer + contact block after deploy; grep for single email/phone |
| **Real failure or false positive?** | **Real failure** in PDF asset. **False positive** on live site (`verify-website-contact.ts` PASS all routes). |

---

### 8. Business address consistency

| Field | Detail |
|-------|--------|
| **Evidence available** | PDF text: 235 Queen Mary Avenue, Durban; live verification PASS |
| **Missing evidence** | Consistent address in **all** PDF screenshots (contact image wrong) |
| **Screenshots required** | Re-capture contact, terms footer, privacy footer, refunds footer |
| **URLs** | Same as §7 |
| **User journey** | Visual check: every screenshot shows Durban address, not Sandton/Johannesburg |
| **Real failure or false positive?** | **Real failure** in PDF contact image only. |

---

### 9. Terms and Privacy pages

| Field | Detail |
|-------|--------|
| **Evidence available** | PDF `03-privacy.png`, `04-terms.png` (large, readable); MP4 policy segment |
| **Missing evidence** | POPIA page screenshot (`/legal/popia`) if Paystack requests full policy set |
| **Screenshots required** | Optional `popia-notice.png` |
| **URLs** | `https://tipguardsa.co.za/terms`, `https://tipguardsa.co.za/privacy` |
| **User journey** | Open each → scroll to show “Last updated” + operator name → capture |
| **Real failure or false positive?** | **PASS** for Terms/Privacy in PDF. |

---

### 10. Merchant onboarding flow

| Field | Detail |
|-------|--------|
| **Evidence available** | `video-raw/06-merchant.png` (venue profile step 1); `/legal/merchant` legal copy |
| **Missing evidence** | Steps 2–3 (sites, payment QR), completed onboarding state, link to `/merchant/setup` |
| **Screenshots required** | `onboarding-step1.png`, `onboarding-step2.png`, `onboarding-step3.png` |
| **URLs** | `https://tipguardsa.co.za/onboarding`, `https://tipguardsa.co.za/merchant/setup` |
| **User journey** | New merchant register → complete wizard → arrive at merchant hub |
| **Real failure or false positive?** | **Real failure** for complete onboarding evidence in submission pack. |

---

### 11. KYC flow

| Field | Detail |
|-------|--------|
| **Evidence available** | Route `/merchant/kyc` exists; legal text in `MerchantOnboardingLegal.tsx` |
| **Missing evidence** | Any screenshot of KYC form, status badge, submission state |
| **Screenshots required** | `merchant-kyc-form.png`, `merchant-kyc-status.png` |
| **URLs** | `https://tipguardsa.co.za/merchant/kyc` |
| **User journey** | Merchant login → KYC → show declaration fields + verification badge |
| **Real failure or false positive?** | **Real failure** (not in PDF or MP4). Product exists; evidence not captured. |

---

### 12. Wallet funding flow

| Field | Detail |
|-------|--------|
| **Evidence available** | `CustomerWallet.tsx` + `payWalletTopUpWithPaystack`; not tipping flow |
| **Missing evidence** | Customer wallet balance, top-up amount, Paystack redirect for wallet |
| **Screenshots required** | `customer-wallet.png`, `customer-wallet-topup-checkout.png` (only if Paystack scope includes wallet) |
| **URLs** | `https://tipguardsa.co.za/customer/wallet` (requires customer login) |
| **User journey** | Customer sign-in → wallet → enter amount → Paystack → success |
| **Real failure or false positive?** | **Real failure** if wallet is in scope for submission. **N/A** for standard tipping-only Paystack review (confirm with Paystack). |

---

## Root cause: PDF generator

`scripts/generate-paystack-submission-pdf.ts` **short-circuits** fresh Playwright captures when `assets/compliance/lockdown-evidence/*` exists (`copyMap`). Stale assets include wrong contact address, Cloudflare checkout frame, and empty merchant/guard shells.

**Remediation:** Delete or bypass `copyMap`; require `naturalWidth > 0` and minimum file size (e.g. >50KB for dashboards); wait for dashboard `networkidle` + visible stats before screenshot.

---

## NEW Paystack submission checklist (package-only)

| # | Item | Status | Notes |
|---|------|--------|-------|
| 1 | PDF file valid (opens, ≥500KB, embedded images) | **PASS** | `PAYSTACK_FINAL_SUBMISSION_PACKAGE.pdf` ~1.3MB, 11 images |
| 2 | Compliance MP4 present (60–90s) | **PASS** | ~66s, `PAYSTACK_COMPLIANCE_PAYMENT_FLOW.mp4` |
| 3 | MP4 shows hosted Paystack checkout | **PASS** | Steps 2–3 in recorder |
| 4 | MP4 shows payment success on TipGuard | **PASS** | Step 4–5 |
| 5 | MP4 shows merchant + guard post-payment | **FAIL** | Guard frame empty; merchant is setup not dashboard |
| 6 | PDF: hosted Paystack checkout screenshot | **FAIL** | Cloudflare challenge image |
| 7 | PDF: payment success (real payment) | **FAIL** | Simulated URL only |
| 8 | PDF: platform fee on tip landing | **FAIL** | Captured during “Preparing checkout…” |
| 9 | PDF: platform fee on success page | **FAIL** | Fee lines not visible in static shot |
| 10 | PDF: platform fee text table | **PASS** | Markdown table in PDF |
| 11 | PDF: merchant dashboard (populated) | **FAIL** | Empty nav shell |
| 12 | PDF: guard wallet (balance visible) | **FAIL** | Empty nav shell |
| 13 | PDF: QR generation workflow | **FAIL** | Empty nav shell |
| 14 | PDF: contact page (correct details) | **FAIL** | Sandton address in image |
| 15 | PDF: address consistent across images | **FAIL** | Contact image contradicts text table |
| 16 | PDF: Terms page | **PASS** | `04-terms.png` |
| 17 | PDF: Privacy page | **PASS** | `03-privacy.png` |
| 18 | PDF: Refund policy | **PASS** | `05-refunds.png` |
| 19 | PDF: homepage + policy nav | **PASS** | `01-homepage.png` |
| 20 | PDF: merchant onboarding | **FAIL** | Not included (only broken dashboard slot) |
| 21 | PDF: merchant KYC | **FAIL** | Missing |
| 22 | PDF: customer wallet funding | **FAIL** | Missing |
| 23 | MP4 filename referenced in PDF | **PASS** | `PAYSTACK_COMPLIANCE_PAYMENT_FLOW.mp4` cited |
| 24 | Test payment evidence (fee math) | **PASS** | `12-fee-evidence.txt` + verify script |
| 25 | AI generation workflow | **N/A** | No AI feature; use QR generation (#13) |
| 26 | Shared wallet (separate product) | **N/A** | Use guard wallet (#12) |

### Readiness score

| Result | Count |
|--------|-------|
| **PASS** | 8 |
| **FAIL** | 11 |
| **N/A** | 2 |
| **Applicable items** | 24 |
| **Submission readiness** | **8 ÷ 24 = 33%** (strict) |
| **Weighted (MP4 counts 2× for payment flow)** | **≈ 42%** |

**Recommendation:** Do **not** submit current PDF as primary evidence. Submit **MP4 + live URLs** immediately; regenerate PDF after fresh captures (disable `copyMap`, fix Playwright waits).

---

## Capture runbook (ordered)

1. `npx tsx scripts/create-compliance-qr-token.ts` (or use `demo-staging-qr-01`)
2. Incognito: tip → Pay → Paystack → success → screenshot fee breakdown
3. Merchant login: `/merchant` (loaded), `/merchant/qr` (create QR), `/merchant/kyc`
4. Guard login: `/guard` (balance after tip)
5. Policy pages: contact, terms, privacy, refunds (no stale copies)
6. `npx tsx scripts/generate-paystack-submission-pdf.ts` (after fixing copyMap)
7. Attach MP4 + PDF to Paystack portal
