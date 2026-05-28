# Video recording guide — Paystack compliance

**Goal:** Produce two MP4 files for Paystack submission without committing empty placeholders to git.

---

## Output files (do not commit empty MP4s)

| File | Purpose | Suggested location |
|------|---------|-------------------|
| `PAYMENT_FLOW_SCREEN_RECORDING.mp4` | Customer 10-step flow | `assets/compliance/PAYMENT_FLOW_SCREEN_RECORDING.mp4` |
| `MOBILE_PAYMENT_DEMO.mp4` | Phone QR / NFC tip | `assets/compliance/MOBILE_PAYMENT_DEMO.mp4` |

Add to `.gitignore` if files are large, or upload to Paystack portal / Google Drive and link in submission email.

**Scripts:** [CUSTOMER_PAYMENT_FLOW_SCRIPT.md](./CUSTOMER_PAYMENT_FLOW_SCRIPT.md), [MERCHANT_DEMO_SCRIPT.md](./MERCHANT_DEMO_SCRIPT.md)

---

## Tooling options

### Option A — OBS Studio (recommended, desktop)

1. Install [OBS Studio](https://obsproject.com/) (macOS/Windows).
2. **Settings → Video:** 1920×1080 or 1280×720, 30 FPS.
3. **Sources:** Display Capture (show browser URL bar) or Window Capture (Chrome only).
4. **Settings → Output:** Recording format **MP4**, encoder hardware if available.
5. **Settings → Audio:** disable mic if not narrating; optional mic for voiceover.
6. **Record** before step 1 of customer script; **Stop** after step 10.
7. **File → Remux** if OBS saved `.mkv` → convert to `.mp4`.

### Option B — Loom (quick, cloud)

1. Install Loom browser extension or desktop app.
2. Select **Screen only** (Chrome tab: tipguardsa.co.za).
3. Follow [CUSTOMER_PAYMENT_FLOW_SCRIPT.md](./CUSTOMER_PAYMENT_FLOW_SCRIPT.md).
4. Download MP4 from Loom dashboard → rename to `PAYMENT_FLOW_SCREEN_RECORDING.mp4`.

### Option C — macOS QuickTime

1. QuickTime → **File → New Screen Recording**.
2. Record selected portion (browser window).
3. **File → Export As → 1080p** → `.mp4`.

---

## PAYMENT_FLOW_SCREEN_RECORDING.mp4 — timestamps

| Time | Content |
|------|---------|
| 0:00–0:30 | Landing + footer legal links |
| 0:30–1:30 | Login demo customer |
| 1:30–2:00 | Open `/tip/demo-staging-qr-01` |
| 2:00–3:00 | Select R20 → Pay → loading state |
| 3:00–5:00 | Paystack Inline test card payment |
| 5:00–6:30 | `/payment/success` + reference |
| 6:30–7:30 | Optional: customer dashboard / guard wallet |

**Length target:** 7–10 minutes (max 15).

---

## MOBILE_PAYMENT_DEMO.mp4 — timestamps

Record on **physical phone** (Android preferred for NFC):

| Time | Content |
|------|---------|
| 0:00–0:20 | Chrome → `https://tipguardsa.co.za/tip/demo-staging-qr-01` |
| 0:20–1:00 | Sign in (mobile login UI) |
| 1:00–2:30 | Preset tip → Pay → Paystack mobile UI |
| 2:30–3:30 | Success page on phone |
| 3:30–5:00 | **Optional NFC:** tap tag → same tip URL → pay R10 |

**iOS note:** Web NFC not available; record QR-only flow on iPhone.

---

## Test card reminder

Use Paystack **test** cards from Dashboard while production shows test mode.  
Do not use live cards until `pk_live_` cutover ([LIVE_KEY_CUTOVER.md](./LIVE_KEY_CUTOVER.md)).

---

## Browser MCP / automated capture

Automated browser recording was **not** used for this pack (Paystack requires real payment UI and optional NFC). Use OBS/Loom/QuickTime above.

---

## Checklist before upload to Paystack

- [ ] URL bar shows `tipguardsa.co.za` throughout customer flow
- [ ] Paystack modal visible (inline, not foreign domain checkout)
- [ ] Success URL shows `/payment/success?ref=`
- [ ] No passwords or secret keys visible
- [ ] MP4 plays in VLC / QuickTime
- [ ] File size reasonable (&lt; 100 MB preferred)

---

## Where to attach in submission

1. Paystack merchant application **Documents** section, or
2. Email to Paystack support with links to hosted MP4s, referencing business name **TipGuard SA** and domain **tipguardsa.co.za**.
