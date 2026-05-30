# iPhone “Tip link unavailable” — root cause & fix

## User action required

**Paste the exact URL from your iPhone Safari address bar** after scanning your physical QR.  
We cannot assume `demo-staging-qr-01` — that is only the compliance demo token.

Field debug: add `?tg_resolve_debug=1` to your URL and note `rows`, `rpcOk`, `reason` on the error screen.

Operator check:

```bash
npx tsx scripts/lookup-tip-token.ts '<paste-full-url-here>'
```

See [PHYSICAL_QR_TOKEN_TRACE.md](./PHYSICAL_QR_TOKEN_TRACE.md).

---

## 1. When the UI shows “Tip link unavailable”

| String | File | Condition |
|--------|------|-----------|
| Heading **Tip link unavailable** | `QrTipLanding.tsx` | `error \|\| !target` after resolve |
| Body (varies by reason) | `userFacingErrors.ts` → `qrResolveErrorMessage` | See reasons below |
| **Link code:** `{token}` | `QrTipLanding.tsx` | Always on error (helps match printed QR) |
| Debug line | `QrTipLanding.tsx` | `?tg_resolve_debug=1` |

### Error reasons (distinct messages)

| `reason` | User message gist |
|----------|-------------------|
| `empty_rpc` | QR not active — expired, revoked, or venue/guard rules failed server-side |
| `timeout` | Slow mobile connection — try again |
| `network` | Could not reach TipGuard |
| `guard_unverified` | Guard not verified |
| `venue_inactive` | Merchant/business not verified |
| `invalid_token` | Malformed token in URL |

Console: `[TipGuard:resolve] rpc ok` / `rpc empty` / `retry after miss`.

---

## 2. Production RPC (example — demo token only)

For **`demo-staging-qr-01`** only (automation / compliance):

```bash
curl -sS -X POST 'https://fyjmujhlqpvfryelnfum.supabase.co/rest/v1/rpc/resolve_tip_target' \
  -H "apikey: $ANON" -H "Authorization: Bearer $ANON" \
  -H "Content-Type: application/json" \
  -d '{"p_token":"demo-staging-qr-01"}'
```

**2026-05-29 sample response:**

```json
[{
  "guard_id": "b1000003-0003-4003-8003-000000000003",
  "location_id": null,
  "merchant_id": null,
  "guard_display_name": "Nomsa Demo",
  "default_amount_cents": null,
  "scan_count": 130,
  "qr_type": "guard_staff"
}]
```

**Your physical token** may differ — run lookup on the pasted URL.

### Likely physical QR on prod (2026-05-29 scan)

`lookup-tip-token.ts --list-active` shows **merchant_permanent** codes like `tg_687d695693ad4db09b8e39b6fa816178` (label **GOOD FEELAS**, venue **dr auto**):

| Check | Value |
|-------|--------|
| `expires_at` | 2027-07-03 (not expired) |
| `revoked_at` | null |
| `merchant.verified` | **false** |
| `guards` on merchant | **[]** |
| `resolve_tip_target` | **0 rows** |

**iPhone shows “Tip link unavailable” because the server correctly rejects the QR** — not because `demo-staging-qr-01` is broken. Automation often uses the demo guard token (130 scans, resolves OK).

**Fix for venue:** complete merchant KYC/verification and add at least one verified guard, then reprint QR if token was rotated.

---

## 3. `/tip/` vs `/qr/` vs `/t/`

All routes use the same `QrTipLanding` and `resolve_tip_target(p_token)` (`App.tsx`).  
Expected canonical URL: **`https://tipguardsa.co.za/tip/{code_token}`**.

---

## 4. Why automation passed but a physical iPhone failed

| Factor | Automation / desktop | Physical iPhone |
|--------|----------------------|-----------------|
| Token | Often `demo-staging-qr-01` (seeded, valid) | Unknown until user pastes URL |
| Network | Fast Wi‑Fi, ~3s RPC | Cellular, 8s+ possible |
| Client bugs (fixed) | Double `qrResolveErrorMessage` masked real reason | Showed generic “venue setting up” |
| Client bugs (fixed) | 10s page timeout could set error before RPC finished | Stale error if resolve later succeeded |
| Cache | Fresh session | `sessionStorage` `tipguard_resolve_*` — cleared on **Try again** |

**Backend for demo token:** not expired, not revoked, guard verified — RPC returns a row.  
**Physical QR:** may be a different token, expired, revoked after regenerate, or unverified venue.

---

## 5. Code fixes shipped

1. **Distinct error reasons** — `userFacingErrors.ts` (`QrResolveFailureReason`).
2. **No double-wrapping** — `QrTipLanding` uses `isQrResolveUserMessage` + `debug.reason`.
3. **Clear error on success** — `setError(null)` when resolve returns target.
4. **Removed 10s fake page timeout** — rely on RPC timeout + `SlowLoadHint`.
5. **Mobile RPC timeout 16s** — `qrResolveTimeoutMs()` for iPhone/Android.
6. **Auto-retry once** — `resolveTipTarget` on timeout/network/empty RPC.
7. **Cache clear on retry** — `clearResolveCacheForToken`.
8. **Field debug** — `?tg_resolve_debug=1`, link code on error UI.
9. **`scripts/lookup-tip-token.ts`** — operator token/URL lookup + `--list-active`.

---

## 6. Real device re-test (user)

1. Settings → Safari → **Clear History and Website Data** for `tipguardsa.co.za` (or use Private tab).
2. Scan **your physical QR** (not a demo link).
3. Copy URL from address bar → send to support or run lookup script.
4. If error: open same URL with `?tg_resolve_debug=1`, screenshot, tap **Try again** once.
5. **PASS:** heading **Tip {Guard name}**, R10/R20/R50 chips.  
   Paystack pay requires customer sign-in (screenshot 05 separate).

---

## 7. Mobile emulation (post-deploy)

After deploy, verify with a token known to resolve (e.g. demo for CI only):

- URL: https://tipguardsa.co.za/tip/demo-staging-qr-01  
- Viewport: 390×844 Safari-like  
- **PASS criteria for demo token only:** “Tip Nomsa Demo” visible.

Screenshots: `assets/compliance/prod-proof/` (see README there).

**Status:** Mark **resolved for demo token** when emulation shows Nomsa Demo; **physical QR** remains **pending user URL paste**.
