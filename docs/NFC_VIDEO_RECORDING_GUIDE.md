# NFC payment flow — screen recording guide

Produce **`NFC_PAYMENT_FLOW_RECORDING.mp4`** for compliance / Paystack review. **Do not commit the video file to git** (binary + PII risk). Store in secure drive or ticket attachment.

---

## What to capture (2–4 minutes)

1. **Tag close-up** (optional): show official TipGuard tag (no secrets on camera).
2. **Android Chrome**: Guard hub → **Scan NFC tag** → tap → “Verifying link…” → tip page with correct name.
3. **Amount + Pay**: Sign in if needed → R20 → Paystack test modal → success page.
4. **QR fallback** (optional): Deny NFC or use invalid tag → **Open QR tipping instead** → same token page.
5. **iPhone** (optional second clip): Safari open same `/tip/{token}` — proves universal QR path.

---

## Android recording

| Method | Steps |
|--------|--------|
| Built-in screen recorder | Quick settings → Screen record → enable mic if narrating → run flow → stop |
| `adb` (developer) | `adb shell screenrecord /sdcard/nfc_flow.mp4` → reproduce flow → Ctrl+C → `adb pull /sdcard/nfc_flow.mp4 ./NFC_PAYMENT_FLOW_RECORDING.mp4` |

**Settings:** 1080p, 30fps, portrait, Do Not Disturb on, hide notifications.

---

## iPhone recording

1. **Settings → Control Center** → add **Screen Recording**.
2. Start recording → Safari flow → stop from red status bar.
3. **Photos** → share → AirDrop to workstation → rename to `NFC_PAYMENT_FLOW_RECORDING.mp4` if converted.

---

## Post-production checklist

- [ ] Blur or cut email / phone / full card number (test cards OK per Paystack docs).
- [ ] On-screen URL shows `tipguardsa.co.za` (not third-party checkout domain except Paystack modal).
- [ ] Export H.264 MP4, &lt; 50 MB if attaching to email.
- [ ] Filename exactly: `NFC_PAYMENT_FLOW_RECORDING.mp4`
- [ ] Link recording in ticket; add path in [PHYSICAL_NFC_QA_REPORT.md](./PHYSICAL_NFC_QA_REPORT.md) sign-off only (not in repo).

---

## What NOT to do

- Do not add a placeholder or empty `.mp4` to the repository.
- Do not commit tags with production secrets or live customer data.
- Do not record live-money cards until go-live approval.

---

## Related

- [PHYSICAL_NFC_QA_REPORT.md](./PHYSICAL_NFC_QA_REPORT.md)
- [NFC_SECURITY_VALIDATION.md](./NFC_SECURITY_VALIDATION.md)
- [CUSTOMER_PAYMENT_FLOW_SCRIPT.md](./CUSTOMER_PAYMENT_FLOW_SCRIPT.md)
