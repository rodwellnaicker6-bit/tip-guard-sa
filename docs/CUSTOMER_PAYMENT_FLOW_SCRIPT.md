# Customer payment flow — screen recording script (10 steps)

**Use for:** `PAYMENT_FLOW_SCREEN_RECORDING.mp4` (see [VIDEO_RECORDING_GUIDE.md](./VIDEO_RECORDING_GUIDE.md))  
**URL:** https://tipguardsa.co.za  
**Paystack:** test mode (`pk_test_…`) — use Paystack test cards only  
**Duration:** ~8–12 minutes

Speak briefly at each step; keep the browser URL bar visible when possible.

---

## Step 1 — Landing & compliance links

1. Open **https://tipguardsa.co.za/**
2. Scroll to footer: **Terms**, **Privacy**, **Refunds**, **Contact**
3. Optional: click **Contact** → show business block (email, phone, address)
4. Return to home

**On-screen text:** “TipGuard SA — digital tipping on our own domain.”

---

## Step 2 — Sign in

1. Click **Sign in** → **https://tipguardsa.co.za/login**
2. Sign in as demo customer (after `npm run seed:demo` on linked Supabase):
   - Email: `demo-customer@tipguard.staging`
   - Password: `TipGuardDemo2026!`

**On-screen text:** “Payer must be authenticated before Paystack opens.”

---

## Step 3 — Browse guards (optional)

1. Go to **https://tipguardsa.co.za/customer**
2. Show verified guard list

---

## Step 4 — Open QR tip page

1. Navigate to **https://tipguardsa.co.za/tip/demo-staging-qr-01**
2. Show guard name, amount presets (R10 / R20 / R50)

**On-screen text:** “Payment starts on tipguardsa.co.za — not a third-party marketplace.”

---

## Step 5 — Select amount

1. Tap **R20** (or another preset ≥ R10)
2. Confirm **Pay** button is enabled while signed in

---

## Step 6 — Initialize checkout

1. Tap **Pay**
2. Show loading: “Creating your secure payment…” / “Opening Paystack checkout…”
3. **Do not** navigate away from TipGuard tab

---

## Step 7 — Paystack Inline modal

1. Paystack overlay opens (script: `https://js.paystack.co/v1/inline.js`)
2. Enter Paystack **test** card from Dashboard → API Keys → test cards
3. Complete payment

**On-screen text:** “Card data handled by Paystack; TipGuard never stores PAN.”

---

## Step 8 — Success redirect (same domain)

1. After success, URL should be:
   - **https://tipguardsa.co.za/payment/success?ref=…&kind=tip&amount_cents=…**
2. Show “Confirming with Paystack…” then success state

---

## Step 9 — Verify reference

1. Point at Paystack reference on success page
2. Optional: open browser DevTools → Network → show `paystack-verify` call (no secrets)

---

## Step 10 — Close loop

1. Navigate to **https://tipguardsa.co.za/customer/dashboard** or history
2. Optional: sign in as `demo-guard@tipguard.staging` → `/guard` to show tip received (after webhook, ~seconds)

**Closing line:** “Funds settle server-side via webhook; customer never leaves tipguardsa.co.za except Paystack’s inline modal.”

---

## Cancel path (optional B-roll, 30s)

1. Repeat step 4–6
2. Close Paystack modal without paying
3. Show **https://tipguardsa.co.za/payment/failure?reason=cancelled**

---

## Payment URL reference

| Step | URL |
|------|-----|
| Landing | `/` |
| Login | `/login` |
| QR tip | `/tip/:token` or `/qr/:token` |
| Paystack init | Supabase Edge `paystack-initialize` |
| Success | `/payment/success?ref=&kind=tip` |
| Failure | `/payment/failure` |
| Webhook | `…/functions/v1/paystack-webhook` |

Code: `src/services/paystackCore.ts`, `supabase/functions/paystack-initialize/index.ts`.
