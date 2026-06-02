# Paystack compliance — final report

**Operator:** TipGuard SA  
**Production URL:** https://tipguardsa.co.za  
**Report date:** 30 May 2026  
**Paystack mode:** Test (`pk_test_` / `sk_test_`) — live keys intentionally withheld until account approval

---

## Executive summary

| Area | Status | Notes |
|------|--------|-------|
| End-to-end payment flow | **PASS** | Callback URL deployed; browser return to `/payment/success` confirmed |
| Compliance screen recording | **PASS** | 66s MP4 at `assets/compliance/PAYSTACK_COMPLIANCE_PAYMENT_FLOW.mp4` |
| HTTPS & legal routes | **PASS** | All policy URLs return HTTP/2 200 over TLS |
| Business contact (phone/address) | **MANUAL** | Template placeholders until Vercel env vars set |
| Paystack portal upload | **MANUAL** | Attach MP4 + policy URLs in merchant verification form |
| Live payment keys | **FAIL** (by policy) | Switch only after Paystack approval — see `docs/LIVE_KEY_CUTOVER.md` |

**Recommendation:** Submit for **test-mode merchant verification** with the MP4 and public URLs below. Set real phone/address in Vercel before final live-key review if Paystack requires non-placeholder contact details.

---

## 1. Compliance payment-flow video

| Property | Value |
|----------|--------|
| **File** | `assets/compliance/PAYSTACK_COMPLIANCE_PAYMENT_FLOW.mp4` |
| **Duration** | ~66 seconds (within 60–90s target) |
| **Codec** | H.264 (libx264), yuv420p, no audio |
| **Resolution** | 1280×720 (mobile viewport 390×844, scaled for review) |
| **Size** | ~0.7 MB |
| **Recorder** | `npx tsx scripts/record-paystack-compliance-video.ts` |

### Flow shown (8 steps)

| Step | What reviewers see |
|------|-------------------|
| 1 | Customer opens tip URL (QR deep link `/tip/:token`) |
| 2 | Tip landing — guard/venue, amount chips |
| 3 | Customer confirms amount and pays |
| 4 | Paystack hosted checkout (test mode — Success button) |
| 5 | Automatic redirect to TipGuard `/payment/success` — **Payment confirmed** |
| 6 | Merchant dashboard (demo merchant signed in) |
| 7 | Guard portal — wallet balance updated |
| 8 | Contact page + refund policy (public compliance pages) |

**Supporting stills:** `assets/compliance/video-raw/02-tip-landing.png`, `05-success.png`, `06-merchant.png`, `07-guard.png`

**Re-record:**

```bash
npx playwright install chromium   # once
npm run record:compliance-video   # requires .env with Supabase service role
```

---

## 2. Public website verification (30 May 2026)

| Requirement | URL | HTTP | Status |
|-------------|-----|------|--------|
| HTTPS / TLS | https://tipguardsa.co.za | 200 HTTP/2 | **PASS** |
| HSTS | `strict-transport-security: max-age=63072000` | present | **PASS** |
| Business contact | https://tipguardsa.co.za/contact | 200 | **PASS** (email + legal name; see §3) |
| Privacy Policy | https://tipguardsa.co.za/privacy | 200 | **PASS** |
| Terms of Service | https://tipguardsa.co.za/terms | 200 | **PASS** |
| Refund Policy | https://tipguardsa.co.za/legal/refunds | 200 | **PASS** |
| Refund aliases | `/refund`, `/refunds` | redirect → `/legal/refunds` | **PASS** |
| POPIA notice | https://tipguardsa.co.za/legal/popia | 200 | **PASS** |

Footer and legal layout link Terms, Privacy, Refunds, and Contact on all legal pages (`LegalPageLayout`).

---

## 3. Business contact details

Rendered via `BusinessContactBlock` / `getBusinessContact()`:

| Field | Production value | Status |
|-------|------------------|--------|
| Legal name | TipGuard SA (Pty) Ltd (default) | **PASS** |
| Support email | support@tipguard.co.za (default) | **PASS** |
| Phone | +27 00 000 0000 (placeholder) | **MANUAL** — set `VITE_BUSINESS_PHONE` |
| Address | 123 Example Street, Sandton… (placeholder) | **MANUAL** — set `VITE_BUSINESS_ADDRESS` |

Production may show an **OPERATOR MUST UPDATE** banner until env vars are set. Paystack reviewers often accept real email + legal name for test review; update phone/address before live-key cutover.

---

## 4. Payment technical compliance

| Check | Status | Evidence |
|-------|--------|----------|
| Checkout on tipguardsa.co.za | **PASS** | `/tip/:token`, Paystack initialize from Edge |
| `callback_url` on initialize | **PASS** | `PUBLIC_APP_URL=https://tipguardsa.co.za` in Supabase secrets; `paystack-initialize` always sets callback |
| Return after Paystack | **PASS** | `/payment/success?ref=…&kind=tip` — state machine `confirmed` |
| Webhook settlement | **PASS** | `paystack-webhook` on Supabase Edge; HMAC verified |
| Wallet / merchant ledger | **PASS** | `wallet_accounts` repair migration; 10/10 production simulations PASS |
| No third-party marketplace checkout | **PASS** | Code audit — Paystack + TipGuard domains only |

**Demo credentials (test only):** see `docs/PAYSTACK_REVIEW_DEMO.md` — do not publish in Paystack submission email body; reference “demo available on request.”

---

## 5. Final compliance checklist

### Ready for submission (test-mode review)

- [x] HTTPS enabled with HSTS
- [x] Privacy, Terms, Refund policies publicly reachable
- [x] Contact page with operator name and support email
- [x] Full customer payment flow demonstrated in MP4 (60–90s)
- [x] Paystack checkout → automatic return → success page
- [x] Merchant dashboard and guard wallet shown post-payment
- [x] `PUBLIC_APP_URL` aligned with production domain

### Operator actions before / during Paystack review

- [ ] Upload `PAYSTACK_COMPLIANCE_PAYMENT_FLOW.mp4` to Paystack merchant verification portal (or secure link in cover email)
- [ ] Set Vercel production: `VITE_BUSINESS_PHONE`, `VITE_BUSINESS_ADDRESS`, `VITE_BUSINESS_LEGAL_NAME`, `VITE_SUPPORT_EMAIL` (redeploy)
- [ ] Confirm Paystack dashboard webhook URL points to production Edge function
- [ ] Optional: record 1920×1080 walkthrough per `docs/REVIEW_VIDEO_MASTER_SCRIPT.md` for extended review packs

### After Paystack approval only

- [ ] Switch to `pk_live_` / `sk_live_` per `docs/LIVE_KEY_CUTOVER.md`
- [ ] Re-run one live-card smoke on production
- [ ] Remove or gate test-card UI helpers if any remain in production build

---

## 6. Artifacts index

| Artifact | Path |
|----------|------|
| **Primary compliance MP4** | `assets/compliance/PAYSTACK_COMPLIANCE_PAYMENT_FLOW.mp4` |
| Checklist (living) | `docs/PAYSTACK_COMPLIANCE_CHECKLIST.md` |
| Customer flow script | `docs/CUSTOMER_PAYMENT_FLOW_SCRIPT.md` |
| Recording guide | `docs/VIDEO_RECORDING_GUIDE.md` |
| Demo accounts | `docs/PAYSTACK_REVIEW_DEMO.md` |
| Security validation | `docs/PRODUCTION_SECURITY_VALIDATION.md` |

---

## 7. Submission cover text (template)

> **Business:** TipGuard SA — digital tipping for security guards and venues in South Africa.  
> **Website:** https://tipguardsa.co.za (HTTPS)  
> **Policies:** Privacy `/privacy`, Terms `/terms`, Refunds `/legal/refunds`, Contact `/contact`  
> **Product:** Customers scan venue QR codes, enter a tip amount, pay via Paystack, and receive on-site confirmation; guards receive wallet credits; merchants see tips on their dashboard.  
> **Attachment:** 66-second screen recording of full test-mode payment flow (QR → Paystack → success → merchant → guard wallet).  
> **Technical:** Webhook and `callback_url` hosted on our Supabase Edge infrastructure; no external marketplace redirects.

---

*Generated as part of Paystack compliance finalization. For checklist deltas, see `docs/PAYSTACK_COMPLIANCE_CHECKLIST.md`.*
