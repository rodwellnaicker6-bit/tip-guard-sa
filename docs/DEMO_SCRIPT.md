# Paystack reviewer demo script (10 steps)

**Duration:** ~15 minutes  
**Environment:** Staging/test keys recommended (`pk_test_`, `sk_test_`)  
**App:** https://tip-guard-sa.vercel.app (or your staging URL)

---

## 1. Landing

Open `/` — confirm TipGuard branding, Terms/Privacy links, Paystack test-mode banner if using test keys.

## 2. Customer sign-in

Go to `/login` → sign in as demo customer:

- Email: `demo-customer@tipguard.staging`
- Password: `TipGuardDemo2026!` (after `npm run seed:demo` on linked project)

## 3. Browse guards

`/customer` — list of verified guards; select one or use QR flow next.

## 4. QR tip landing

Open `/tip/demo-staging-qr-01` — guard name, amount presets (R10/R20/R50), **Pay** button enabled when signed in.

## 5. Start checkout

Tap **Pay R20** (or custom amount ≥ R1) — overlay “Creating your secure payment…” then Paystack inline modal.

**Expected:** No “Invalid session” (user JWT attached). If error, sign out and sign in again.

## 6. Paystack test payment

Use Paystack test card (see your Dashboard → Settings → API Keys → test cards):

- Successful charge completes → redirect `/payment/success?ref=…`

## 7. Payment success page

Success page shows reference; server verifies via `paystack-verify` Edge function.

## 8. Guard wallet (optional)

Sign in as `demo-guard@tipguard.staging` → `/guard` — tip appears in history/balance after webhook processes (seconds).

## 9. Merchant view (optional)

Sign in as `demo-merchant@tipguard.staging` → `/merchant` — venue dashboard, QR codes at `/merchant/qr` (no relationship error).

## 10. Admin / compliance

Sign in as `demo-admin@tipguard.staging` → `/admin` — metrics, transactions, fraud/webhook queue link.

**Talking points for reviewer:**

- ZAR-only tips; Paystack South Africa
- Auth-required tipping (POPIA-friendly payer account)
- Webhook + idempotent settlement on server
- Merchant multi-site QR and guard workforce model

---

## R5 live smoke (operators only)

Repeat steps 4–7 with **live keys** and **R5** amount on a pilot QR; confirm Paystack live dashboard + Supabase `transactions.status = succeeded`.

See `docs/PAYSTACK_REVIEW_CHECKLIST.md` and `docs/OPERATOR_LIVE_SMOKE.md`.
