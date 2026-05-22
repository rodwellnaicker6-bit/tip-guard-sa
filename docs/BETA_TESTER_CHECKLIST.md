# Beta tester checklist — TipGuard SA

Use this on a real phone (Android Chrome + iPhone Safari) with **test** Paystack keys.

## Before you start

- [ ] App URL from your invite (staging or production preview)
- [ ] Test card details from Paystack docs (never use live cards on staging)
- [ ] Optional: demo account after `npm run seed:demo` (`demo-customer@tipguard.staging`)

## Auth & session

- [ ] Register → verify email (if enabled) → land on onboarding or dashboard
- [ ] Login → customer dashboard → **pull to refresh** → still signed in
- [ ] Forgot password email arrives; reset link opens `/auth/reset`
- [ ] Sign out returns to home or login

## Customer flows

- [ ] `/customer` lists guards without signing in
- [ ] Sign in → tip a guard → Paystack test checkout completes
- [ ] `/customer/wallet` top-up (if enabled) updates balance after success
- [ ] Tip history and transactions pages load; filters work

## Guard & merchant

- [ ] Guard hub shows balance / recent tips (or empty state)
- [ ] Guard QR page generates a scannable code
- [ ] Merchant setup + KYC pages load for merchant role
- [ ] Merchant dashboard shows **Verified** or **Pending verification** (`merchants.verified`)
- [ ] Merchant QR: create, print, revoke/regenerate (after launch migration `20260625170000` on server)

## Mobile UX (report failures)

- [ ] No horizontal scroll on login, landing, checkout at 360px width
- [ ] Keyboard does not permanently hide email/password fields on auth
- [ ] Primary buttons show loading state and cannot double-submit
- [ ] Offline banner appears in airplane mode; retry works when back online

## Payments edge cases

- [ ] Close Paystack modal — no charge; friendly message
- [ ] Failed payment lands on failure page with reason
- [ ] `/tip/:token` QR link opens tip UI or clear error

## Feedback to send the team

1. Device + OS + browser version  
2. Screenshot or screen recording  
3. Approximate time (SAST) and URL path  
4. Whether you were on Wi‑Fi or mobile data  
