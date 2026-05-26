# TipGuard SA — Monitoring checklist

**Last updated:** 2026-05-25  
**Production:** https://tipguardsa.co.za

Use for **daily ops** (first 2 weeks post-launch) and **incident triage**. See also [OPERATOR_DAILY_CHECKLIST.md](./OPERATOR_DAILY_CHECKLIST.md), [INCIDENT_RESPONSE.md](./INCIDENT_RESPONSE.md).

---

## 1. Automated checks (run 1–2× daily)

```bash
npm run readiness
npm run verify:supabase
npm run verify:paystack
npm run smoke:production
```

| Check | Healthy signal |
|-------|----------------|
| Production HTTP | `https://tipguardsa.co.za/` → 200, TTFB &lt; 1s typical |
| `tipguard-git-sha` meta | Matches expected `main` commit |
| `/api/debug-env` | `mode` matches intent (`test` / `live`), keys masked |
| Webhook unsigned | `verify:paystack` — rejects bad HMAC |
| Webhook signed | `verify:paystack` — accepts valid HMAC |

---

## 2. Supabase Dashboard

### Edge Function logs (last 24h)

- [ ] `paystack-initialize` — mostly 200; note 4xx/5xx spikes
- [ ] `paystack-webhook` — 200 on `charge.success`; **no sustained 400** (bad signature)
- [ ] `paystack-verify` — 200 after customer redirect
- [ ] `request-payout` — expected volume only

### Database

- [ ] `tips` — pending count not growing unbounded (&gt;1h old pending)
- [ ] `transactions` — succeeded tips match Paystack dashboard (sample)
- [ ] `webhook_retry_queue` — pending rows draining (if any)

### Auth

- [ ] No spike in failed sign-ins (Auth → Logs)
- [ ] Email/SMS delivery if OTP enabled

---

## 3. Paystack Dashboard

- [ ] Webhook delivery log — success rate &gt; 99% for `charge.success`
- [ ] Test vs **live** mode matches Vercel `VITE_PAYSTACK_PUBLIC_KEY` prefix
- [ ] Failed charges investigated (customer abandon vs integration bug)

---

## 4. Client-side signals (support / QA)

Filter browser console for:

| Prefix | Meaning |
|--------|---------|
| `[TipGuard:onboarding]` | Role save timing, fail-safe redirect, refresh coalesce |
| `[TipGuard:pay]` | Checkout / Paystack script load |
| `[TipGuard:qr]` | QR resolve path |

**Onboarding stuck:** look for `fail-safe: role saved` — should auto-navigate to `/merchant/setup` within ~11s.

---

## 5. Sentry (if `VITE_SENTRY_DSN` set)

- [ ] New release tagged with deploy commit
- [ ] No rising `EmergencyErrorBoundary` or auth boot fatals
- [ ] Payment errors grouped — distinguish user cancel vs API failure

---

## 6. Weekly

- [ ] Admin → Run daily reconcile (`/admin/transactions`)
- [ ] Review `admin_dashboard_metrics` / failed tx list
- [ ] Supabase advisors (security + performance) — triage new ERRORs
- [ ] Backup restore drill per [BACKUP_VERIFICATION.md](./BACKUP_VERIFICATION.md) (monthly)

---

## 7. Alert thresholds (operator judgment)

| Symptom | Likely cause | First action |
|---------|--------------|--------------|
| All tips pending | Webhook down / HMAC mismatch | Paystack webhook log + Edge secrets |
| Onboarding Saving &gt;15s | RPC/RLS/network | Console `[TipGuard:onboarding]` + Supabase logs |
| 401 on Edge invoke | Expired JWT / clock skew | Re-login; check Auth settings |
| Black screen on load | Bad deploy / env missing | Rollback Vercel; check `VITE_*` |
| QR “invalid link” | Missing RPC / revoked code | `verify:supabase`; merchant QR admin |

---

## 8. Maintenance mode

- Vercel: `VITE_MAINTENANCE_MODE=true` (if wired)
- Supabase Edge: `MAINTENANCE_MODE=true` on functions  
Revert per [ROLLBACK_PLAN.md](./ROLLBACK_PLAN.md) when stable.
