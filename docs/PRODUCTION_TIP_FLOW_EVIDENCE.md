# Production tip flow evidence

**Captured:** 2026-05-29 (UTC)  
**URL under test:** https://tipguardsa.co.za/tip/demo-staging-qr-01  
**Supabase project:** `fyjmujhlqpvfryelnfum`

> There is **no `trips` table** in this app. Public tip resolve uses `qr_codes.code_token` and/or `tip_links.token` → `resolve_tip_target(p_token)` → `guard_id` (UUID). Below, **link identifiers** are documented explicitly.

---

## Verdict

| Check | Result |
|-------|--------|
| Prod tip page UI | **PASS** — h1 `Tip Nomsa Demo`, R10/R20/R50, pay CTA |
| `resolve_tip_target` (curl + browser) | **PASS** — HTTP 200, JSON row returned |
| `qr_codes` row active | **PASS** — `expires_at` 2027-06-25, `revoked_at` null |
| `/api/debug-env` project | **PASS** — `fyjmujhlqpvfryelnfum` |
| RLS anon `guards` read | **PASS** — HTTP 200 (fallback path only; primary path is RPC) |
| Network failed RPC (browser) | **NONE** — `resolve_tip_target` ~1423ms, status 200 |
| Paystack modal (signed-in customer) | **NOT CAPTURED** — login in automation landed on `/merchant`; use `demo-customer@tipguard.staging` manually for Pay screenshot |
| NFC | **Same RPC** — `NfcTapPanel` → `resolveTipTarget` → `/tip/:token` (code path documented below) |

**Screenshots:** `assets/compliance/prod-proof/01-tip-page-nomsa-demo.png`, `02-amounts-sign-in-cta.png`

---

## 1. `/api/debug-env`

```json
{
  "supabaseUrl": "https://fyjmujhlqpvfryelnfum.supabase.co",
  "hasPaystackPublicKey": true,
  "mode": "test",
  "gitSha": "f36add89bf22dea835b9f703b8a81a15b7016601"
}
```

---

## 2. POST `resolve_tip_target` (production anon)

**Request:** `POST https://fyjmujhlqpvfryelnfum.supabase.co/rest/v1/rpc/resolve_tip_target`  
**Body:** `{"p_token":"demo-staging-qr-01"}`  
**Auth:** `apikey` + `Authorization: Bearer` = production publishable/anon key (redacted: `sb_publishable_7Z02c…`)

**Response HTTP 200:**

```json
[
  {
    "guard_id": "b1000003-0003-4003-8003-000000000003",
    "location_id": null,
    "merchant_id": null,
    "guard_display_name": "Nomsa Demo",
    "default_amount_cents": null,
    "scan_count": 128,
    "qr_type": "guard_staff"
  }
]
```

This is the **exact payload** the frontend maps in `resolveTipTarget.ts` → `ResolvedTipTarget`.

---

## 3. Guard record (production SQL)

```json
{
  "id": "b1000003-0003-4003-8003-000000000003",
  "display_name": "Nomsa Demo",
  "verified": true,
  "merchant_id": null,
  "location_id": null
}
```

**Note:** No `trip_id`. Payment uses `guard_id` above.

---

## 4. QR / tip link records (production SQL)

### `qr_codes` (primary for this token)

```json
{
  "id": "eba4b878-1ef1-436c-aa9a-f5437e9a59ee",
  "code_token": "demo-staging-qr-01",
  "guard_id": "b1000003-0003-4003-8003-000000000003",
  "merchant_id": null,
  "expires_at": "2027-06-25T19:21:41.898092+00:00",
  "revoked_at": null,
  "qr_type": "guard_staff",
  "scan_count": 128,
  "default_amount_cents": null
}
```

### `tip_links` (legacy parallel token; RPC prefers active `qr_codes` when present)

```json
{
  "id": "08855fe5-2390-49ee-858f-f1fbb757cba4",
  "token": "demo-staging-qr-01",
  "guard_id": "b1000003-0003-4003-8003-000000000003",
  "expires_at": "2027-06-22T13:26:59.718958+00:00"
}
```

---

## 5. Browser — production page

| Field | Value |
|-------|--------|
| URL | `https://tipguardsa.co.za/tip/demo-staging-qr-01` |
| `h1` | `Tip Nomsa Demo` |
| `unavailable` heading | **false** |
| `navigator.onLine` | true |
| Pay CTA (logged out) | `Sign in to pay` |

Screenshot: `assets/compliance/prod-proof/01-tip-page-nomsa-demo.png`

---

## 6. Browser network (Performance API, prod reload)

| Resource | Duration (ms) | Failed? |
|----------|---------------|---------|
| `…/rpc/resolve_tip_target` | 1423 | **No** (200) |
| `…/rpc/touch_tip_link` | 297 | No (204) |
| `…/rpc/touch_qr_code` | 305 | No (204) |

**No failed `resolve_tip_target` requests** in this session.

---

## 7. Browser console

Expected after `f36add8`: `[TipGuard:resolve] start` → `[TipGuard:resolve] rpc ok` with `guardId`.  
(Automation did not persist console buffer; reproduce in DevTools on live URL.)

---

## 8. Supabase API logs (sample, last 24h)

| Method | Path | Status |
|--------|------|--------|
| POST | `/rest/v1/rpc/resolve_tip_target` | **200** |
| POST | `/rest/v1/rpc/touch_tip_link` | 204 |
| POST | `/rest/v1/rpc/touch_qr_code` | 204 |
| GET | `/rest/v1/guards?id=eq.b1000003-…` | 200 (anon) |
| GET | `/rest/v1/payment_events` | 401 (expected — RLS blocks anon) |

---

## 9. RLS

- **Primary resolve:** `resolve_tip_target` — `SECURITY DEFINER`, not blocked by table RLS.
- **Fallback:** `guards` SELECT by id — anon **200** with `verified: true`.
- **Not used on happy path:** direct anon `qr_codes` SELECT (RPC joins server-side).

---

## 10. NFC path (same resolve)

```
NDEF read → sanitizeTipToken(token)
  → resolveTipTarget(token)  // same RPC resolve_tip_target
  → navigate(/tip/:token)
  → QrTipLanding hydrates from same cache/RPC
```

Source: `src/components/NfcTapPanel.tsx` lines 35–46.

---

## Trace table

| Step | Component | Evidence |
|------|-----------|----------|
| 1 | User opens `/tip/demo-staging-qr-01` | Screenshot 01 |
| 2 | `QrTipLanding` calls `resolveTipTarget` | Network POST 200 |
| 3 | PostgREST `resolve_tip_target` | JSON §2 |
| 4 | SQL joins `qr_codes` + `guards` | Rows §3–4 |
| 5 | UI sets `target.guard_display_name` | h1 `Tip Nomsa Demo` |
| 6 | Pay | `startTipCheckout` after auth (Paystack test mode) |

---

## If you still see “Tip link unavailable”

Backend and live browser proof above show **working** resolve. Client-side causes to clear:

1. **Hard refresh** or clear site data for `tipguardsa.co.za` (stale `sessionStorage` key `tipguard_resolve_demo-staging-qr-01`).
2. **Offline / flaky network** — `QrTipLanding` 10s watchdog shows timeout message (*We could not load this tip page…*).
3. **Wrong token** — must be exactly `demo-staging-qr-01` (regex `^[a-zA-Z0-9_-]{4,128}$`).

Historical root cause (fixed on DB): `qr_codes.expires_at <= now()` → empty RPC. Fix SQL:

```sql
update public.qr_codes
set expires_at = now() + interval '400 days'
where revoked_at is null and expires_at <= now();
```

See `docs/HOTFIX_TIP_LINK_UNAVAILABLE.md`.

---

## Paystack (manual follow-up)

1. Sign in as **customer** (`demo-customer@tipguard.staging` / seed password).
2. Open https://tipguardsa.co.za/tip/demo-staging-qr-01
3. Tap **Pay R 20.00** → Paystack test checkout should open (`mode: test` per debug-env).

Add screenshot `03-paystack-checkout.png` to `assets/compliance/prod-proof/` when captured.
