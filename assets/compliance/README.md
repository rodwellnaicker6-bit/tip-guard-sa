# Compliance media (Paystack / review pack)

**Videos are recorded locally** — we do not commit MP4 binaries to git by default.

## Professional 90s demo (investor + compliance)

| File | Resolution | Script |
|------|------------|--------|
| **`TipGuard_SA_Compliance_Demo_90s.mp4`** | 1920×1080 master (mobile B-roll composited) | [docs/PROFESSIONAL_DEMO_VIDEO_PRODUCTION.md](../../docs/PROFESSIONAL_DEMO_VIDEO_PRODUCTION.md) |

**Supporting docs:**

- [docs/PROFESSIONAL_DEMO_VOICEOVER.md](../../docs/PROFESSIONAL_DEMO_VOICEOVER.md) — narration (~90s)
- [docs/PROFESSIONAL_DEMO_CAPTIONS.md](../../docs/PROFESSIONAL_DEMO_CAPTIONS.md) — on-screen captions + trust badges
- [docs/PROFESSIONAL_DEMO_CAPTIONS.srt](../../docs/PROFESSIONAL_DEMO_CAPTIONS.srt) — SRT import
- [docs/PROFESSIONAL_DEMO_RECORDING_SEQUENCE.md](../../docs/PROFESSIONAL_DEMO_RECORDING_SEQUENCE.md) — capture order

**Demo URL:** https://tipguardsa.co.za/tip/demo-staging-qr-01 · **Deploy:** `VITE_COMPLIANCE_DEMO_MODE=true` — [COMPLIANCE_DEMO_STABILIZATION.md](../../docs/COMPLIANCE_DEMO_STABILIZATION.md)

---

## Required output filenames (full Paystack review)

| File | Resolution | Script |
|------|------------|--------|
| `REVIEW_FULL_PLATFORM_WALKTHROUGH.mp4` | 1920×1080 desktop | [docs/REVIEW_VIDEO_MASTER_SCRIPT.md](../../docs/REVIEW_VIDEO_MASTER_SCRIPT.md) |
| `REVIEW_MOBILE_PAYMENT_DEMO.mp4` | 390×844 or native portrait | [docs/VIDEO_RECORDING_GUIDE_REVIEW.md](../../docs/VIDEO_RECORDING_GUIDE_REVIEW.md) |

**Do not commit empty placeholder MP4 files.**

If files are large, add `assets/compliance/*.mp4` to `.gitignore` and upload to the Paystack portal or secure cloud storage; link URLs in your submission email.

## Legacy filenames (older packs)

| Legacy | Superseded by |
|--------|----------------|
| `PAYMENT_FLOW_SCREEN_RECORDING.mp4` | `REVIEW_FULL_PLATFORM_WALKTHROUGH.mp4` (or customer-only segment) |
| `MOBILE_PAYMENT_DEMO.mp4` | `REVIEW_MOBILE_PAYMENT_DEMO.mp4` |
| `NFC_PAYMENT_FLOW_RECORDING.mp4` | Mobile clip + master script §10 |

## Storyboard screenshots (optional, PNG only)

`screenshots/` — static frames for editors (no fake video):

- `01-landing.png`, `02-login.png`, `03-tip-landing.png`, `04-contact.png`, `05-terms.png`, `06-refunds.png`

See recording guide for capture notes.

## Demo setup

```bash
npm run seed:demo   # requires SUPABASE_URL + SUPABASE_SERVICE_ROLE_KEY
```

Accounts: [docs/PAYSTACK_REVIEW_DEMO.md](../../docs/PAYSTACK_REVIEW_DEMO.md)  
Deploy: `VITE_COMPLIANCE_DEMO_MODE=true` on production demo build — [docs/COMPLIANCE_DEMO_STABILIZATION.md](../../docs/COMPLIANCE_DEMO_STABILIZATION.md)
