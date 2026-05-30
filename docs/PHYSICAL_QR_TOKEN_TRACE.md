# Physical QR / NFC token trace (production)

The **code on the user’s printed QR or NFC tag** is the source of truth — not `demo-staging-qr-01` unless that is what Safari shows.

## 1. Get the exact URL from iPhone Safari

After scanning the physical QR or tapping NFC:

1. Wait until the TipGuard page loads (or shows “Tip link unavailable”).
2. Tap the **address bar** at the top of Safari (shows `tipguardsa.co.za` or similar).
3. **Long-press** the URL → **Copy** (or tap Share → Copy).
4. Paste into Notes or email to support.

**What to capture:**

| Field | Example |
|--------|---------|
| Full URL | `https://tipguardsa.co.za/tip/tg_a1b2c3…` |
| Path only | `/tip/tg_…` or `/qr/tg_…` or `/t/…` |
| Token | Last path segment (after `/tip/`, `/qr/`, or `/t/`) |

**NFC:** Same — Safari opens the deep link; copy from the address bar.

**Optional field debug:** append `?tg_resolve_debug=1` to the same URL and reload. The error screen shows row count, `rpcOk`, and `reason` (no secrets).

## 2. Paste results here (template)

```
Date:
Device: iPhone / model / iOS version:
Network: Wi‑Fi / LTE / 5G:

Pasted URL from Safari:


Token extracted:


Page title shown:


Body message shown:


With ?tg_resolve_debug=1:
  rows=
  rpcOk=
  reason=
```

## 3. Operator lookup (CLI)

From repo root with `.env` pointed at production:

```bash
# Full URL or bare token
npx tsx scripts/lookup-tip-token.ts 'https://tipguardsa.co.za/tip/PASTE_TOKEN_HERE'

# List recent active codes (needs SUPABASE_SERVICE_ROLE_KEY)
npx tsx scripts/lookup-tip-token.ts --list-active 50
```

**Interpretation:**

| Symptom | Likely cause |
|---------|----------------|
| `resolve_tip_target` 0 rows, qr_codes expired | `expires_at` in past |
| qr_codes `revoked_at` set | Code rotated — reprint QR |
| guard `verified: false` | Guard not verified for payments |
| merchant `verified: false` | Venue setup incomplete |
| RPC ok in CLI, phone fails | Client timeout / stale UI — see [IPHONE_TIP_UNAVAILABLE_ROOT_CAUSE.md](./IPHONE_TIP_UNAVAILABLE_ROOT_CAUSE.md) |
| No qr_codes row | Wrong token, typo, or old tip_links-only URL |

## 4. How URLs are generated in the app

| Source | URL pattern | Token format |
|--------|-------------|----------------|
| **Merchant QR hub** | `{origin}/tip/{code_token}` | `tg_` + UUID (no dashes) |
| **Guard QR** | `{origin}/tip/{token}` | `tip_links.token` from DB insert |
| **Demo seed** | `/tip/demo-staging-qr-01` | Fixed staging token |
| **Routes** | `/tip/:token`, `/qr/:token`, `/t/:token` → same `QrTipLanding` + `resolve_tip_target` |

Regenerating a merchant QR calls `regenerate_qr_code_token` — **old printed codes stop working**.

## 5. Common mistakes

- **Typo** in manual URL vs printed QR (`demo-staging` vs `demo-staging-qr-01`).
- **Old print** after “Regenerate token” in merchant dashboard.
- **`/qr/` vs `/tip/`** — both work; token must match `qr_codes.code_token`.
- **Compliance demo token** on a venue’s physical sticker by mistake.

## 6. Active production tokens (2026-05-29 snapshot)

From `npx tsx scripts/lookup-tip-token.ts --list-active 50`:

| code_token | type | guard / venue | Notes |
|------------|------|---------------|--------|
| `tg_687d695693ad4db09b8e39b6fa816178` | merchant_permanent | GOOD FEELAS / dr auto | RPC **empty** — merchant `verified=false`, no guards |
| `tg_eb2a93c3…`, `tg_e37a65f2…`, `tg_ea5ddfb6…` | merchant_permanent | (venues) | Check each with lookup script |
| `f75ef856…`, `231b22e3…`, `3d54c615…` | guard_staff | Nomsa Demo | RPC should return row |
| `demo-staging-qr-01` | guard_staff | Nomsa Demo | Compliance demo only |

Printed merchant hub QRs use `tg_` + UUID. Guard-created links use DB `tip_links.token` (hex-style).

## 7. What we need from the user

> Please paste the **full URL from your iPhone Safari address bar** after scanning your physical QR (not a demo link). We will run `lookup-tip-token.ts` on that token and tell you if the code is expired, revoked, or blocked by venue/guard verification.
