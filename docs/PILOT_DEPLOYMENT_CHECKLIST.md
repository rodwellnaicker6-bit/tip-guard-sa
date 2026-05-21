# TipGuard SA — first pilot deployment checklist

Use this for your first real venue pilot. Project ref: **fyjmujhlqpvfryelnfum**.

---

## 1. Supabase

| Step | Action |
|------|--------|
| 1 | `npx supabase login` |
| 2 | `npx supabase link --project-ref fyjmujhlqpvfryelnfum` |
| 3 | `npm run db:push` (or `DATABASE_URL` in `.env` → `npm run db:apply`) |
| 4 | Confirm RPCs: `resolve_tip_target`, `admin_payment_analytics`, `touch_tip_link` |
| 5 | `npm run seed:demo` (staging only) |
| 6 | Deploy Edge: `paystack-initialize`, `paystack-webhook`, `paystack-verify` |
| 7 | Secrets: `PAYSTACK_SECRET_KEY`, `PUBLIC_APP_URL` |

**Auth → URL configuration**

| Setting | Staging | Production |
|---------|---------|--------------|
| Site URL | `http://localhost:5173` | `https://your-domain.com` |
| Redirects | `/auth/callback`, `/auth/reset` | same on prod domain |

---

## 2. Vercel

| Variable | Environment | Notes |
|----------|-------------|--------|
| `VITE_SUPABASE_URL` | Production + Preview | `https://fyjmujhlqpvfryelnfum.supabase.co` |
| `VITE_SUPABASE_ANON_KEY` | Production + Preview | Publishable key only |
| `VITE_PAYSTACK_PUBLIC_KEY` | Production + Preview | `pk_test_` staging, `pk_live_` prod |
| `VITE_DEMO_MODE` | Preview only | `true` for demos |
| `VITE_PAYSTACK_TEST_MODE` | Optional | `true` on preview |

**Never on Vercel:** `SUPABASE_SERVICE_ROLE_KEY`, `PAYSTACK_SECRET_KEY`

Build: `npm run build` · Output: `dist/` · SPA: `vercel.json` rewrites to `index.html`

---

## 3. Domain

1. Add custom domain in Vercel → DNS CNAME to `cname.vercel-dns.com`
2. Update Supabase Auth Site URL + Redirects to `https://your-domain.com`
3. Update `PUBLIC_APP_URL` Supabase secret for Paystack callbacks
4. Register Paystack webhook: `https://fyjmujhlqpvfryelnfum.supabase.co/functions/v1/paystack-webhook`

---

## 4. Paystack (production-safe)

| Layer | Key type | Where |
|-------|----------|--------|
| Browser | `pk_test_` / `pk_live_` | `VITE_PAYSTACK_PUBLIC_KEY` |
| Edge | `sk_test_` / `sk_live_` | Supabase secret only |
| Webhook | Same as secret | Paystack dashboard |

Test card (sandbox): `4084084084084081`, CVV `408`, future expiry.

---

## 5. Pre-pilot smoke test (15 min)

```bash
npm run verify:supabase
npm run test:auth
npm run build
```

1. Open `/tip/demo-staging-qr-01` → guard name loads
2. Login as demo customer → tip flow (or Paystack test)
3. Login as demo guard → generate QR at `/guard/qr`
4. Login as demo admin → `/admin/analytics`
5. Merchant: `/merchant/setup` → `/merchant/kyc`

---

## 6. Pilot go-live criteria

- [ ] `npm run verify:supabase` — 0 failures
- [ ] Paystack webhook delivers `charge.success` once
- [ ] Tip row `pending` → `succeeded` after webhook
- [ ] `transactions` row matches tip reference
- [ ] No service_role in browser Network tab
- [ ] POPIA privacy/terms linked from checkout

---

## Related

- [DEPLOYMENT_READINESS_REPORT.md](./DEPLOYMENT_READINESS_REPORT.md)
- [AUTH_SUPABASE_LOCAL.md](./AUTH_SUPABASE_LOCAL.md)
- [PAYMENT_QR_ARCHITECTURE.md](./PAYMENT_QR_ARCHITECTURE.md)
