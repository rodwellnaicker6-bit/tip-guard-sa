# NFC security validation

**Product:** TipGuard SA · **Domain:** https://tipguardsa.co.za  
**Last updated:** 2026-05-27  
**Code:** `src/lib/nfc.ts`, `src/components/NfcTapPanel.tsx`, `src/lib/resolveTipTarget.ts`

---

## Threat model (physical tags)

| Threat | Mitigation |
|--------|------------|
| Forged NDEF URL (phishing / Paystack) | Client rejects non-allowlisted hosts and any URL containing `paystack`; only `/tip/{token}` paths accepted on `tipguardsa.co.za`. |
| Replay / swapped guard on tag | Token from tag is **not** trusted for payment metadata; `resolve_tip_target` RPC (or fallback `resolve_tip_link` + verified guard row) runs **before** navigation from `NfcTapPanel`. |
| Direct `guard_id` / `merchant_id` on tag | JSON payloads with `merchant_card` / `staff_badge` / embedded `guard_id` are **not** used for navigation; operators must provision **tip tokens** only. |
| Rapid double-tap | Module debounce (`2.5s`, same token) + existing `resolveInflight` / `payInFlightRef` on checkout. |
| Expired / revoked link | Server RPC returns error; UI shows message + QR fallback. |

---

## Payload sanitization rules

### Allowed on tag (write these only)

| Format | Example | Notes |
|--------|---------|--------|
| Custom scheme | `tipguard://tip/demo-staging-qr-01` | Preferred for NDEF text records |
| HTTPS deep link | `https://tipguardsa.co.za/tip/demo-staging-qr-01` | OK for URL-type records |
| Relative path | `/tip/demo-staging-qr-01` | OK when written as text |
| JSON (limited) | `{"kind":"tap_to_tip","token":"demo-staging-qr-01"}` | Only `tap_to_tip` + validated token |

### Token format

- Regex: `[a-zA-Z0-9_-]{4,128}`
- Enforced in `sanitizeTipToken`, `parseNfcTipPayload`, and `resolveTipTarget`

### Rejected (client-side)

| Payload | Reason |
|---------|--------|
| `https://checkout.paystack.com/...` | Payment must start on TipGuard after server resolve |
| `https://evil.com/tip/fake` | Host not in allowlist |
| `https://tipguardsa.co.za/customer/tip/{uuid}` | Path not `/tip/{token}` |
| `javascript:...`, `data:...` | Blocked schemes |
| JSON with `guard_id` / `merchant_id` only | No direct ID navigation from NFC |

### Allowlisted hosts

- Production: `tipguardsa.co.za`, `www.tipguardsa.co.za`
- Local dev (`import.meta.env.DEV`): `localhost`, `127.0.0.1`

---

## Replay attack mitigation

1. **Tag carries opaque token** — not guard UUID, not Paystack reference.
2. **`NfcTapPanel`** calls `resolveTipTarget(token)` after read; navigates to `/tip/{token}` only if RPC returns a verified guard.
3. **`resolve_tip_target` RPC** (Postgres) maps token → `guard_id`, `merchant_id`, `location_id` with server-side ownership and expiry rules.
4. **`QrTipLanding`** re-runs resolve on page load (cache + inflight dedupe) before Paystack init.
5. **Stale cache** (24h) is display-only fallback on network failure; payment still requires live session + Paystack init.

Operators validating replay: rewrite tag to another venue’s token → UI must show **wrong guard name** only if server still maps that token; revoked token must **fail resolve**, not pay wrong merchant silently.

---

## Merchant / venue ownership (RPC)

- Primary: `resolve_tip_target(p_token)` — enforces tip-link ↔ guard ↔ merchant/venue linkage in database.
- Fallback: `resolve_tip_link` + `guards.verified = true` when RPC missing on older DBs.
- Analytics: `touch_tip_link` / `touch_qr_code` (non-blocking).
- **RLS** on underlying tables prevents anon clients from inventing mappings; never trust client-side `merchant_id` from NDEF.

---

## What to write on physical tags

**Do**

- NDEF **text** record: `tipguard://tip/{qr_token}`  
  or URL record: `https://tipguardsa.co.za/tip/{qr_token}`
- Use the same `{qr_token}` as the guard’s printed QR (`GuardQR` / merchant kit).

**Do not**

- Raw Paystack checkout URLs
- Bare `guard_id` UUIDs
- Third-party short links unless they 302 to `/tip/{token}` on `tipguardsa.co.za` (prefer direct deep link)

---

## Telemetry (operator debugging)

Verbose: `VITE_TIPGUARD_VERBOSE=true` or dev build → `[TipGuard:nfc]` / `[TipGuard:qr]` via `stabilLog`.

| Event | Channel / code |
|-------|----------------|
| NFC read OK | `stabilLog` nfc read ok |
| Invalid payload | `recordError` `nfc_read` / `nfc_invalid_payload` |
| Forbidden URL on tag | `recordError` `nfc_read` / `nfc_forbidden_url` |
| Duplicate tap | `stabilLog` duplicate (no navigation) |
| Scan permission / hardware fail | `recordError` `nfc_scan` / `nfc_prepare` |
| Resolve fail after tap | `recordError` `nfc_resolve` / `resolve_tip_target` |
| Pay init fail | `recordError` `pay_tip_init` (existing) |
| Auth restore after pay | `stabilLog` auth restore redirect (`authRedirect.ts`) |

Console snapshot: `window.__TIPGUARD_ERRORS__()` when error telemetry is attached.

---

## Related docs

- [PHYSICAL_NFC_QA_REPORT.md](./PHYSICAL_NFC_QA_REPORT.md) — operator test matrix  
- [REAL_DEVICE_TEST_RESULTS.md](./REAL_DEVICE_TEST_RESULTS.md) — blank results table  
- [NFC_VIDEO_RECORDING_GUIDE.md](./NFC_VIDEO_RECORDING_GUIDE.md) — screen recording procedure  
- [NFC_QR_PAYMENT_READINESS.md](./NFC_QR_PAYMENT_READINESS.md) — code readiness checklist  
