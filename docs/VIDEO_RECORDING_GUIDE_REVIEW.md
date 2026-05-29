# Video recording guide — Paystack / compliance REVIEW

Produce MP4 files for Paystack merchant review. **Do not commit empty or placeholder MP4s to git.**

| Output file | Resolution | Script |
|-------------|------------|--------|
| **`TipGuard_SA_Compliance_Demo_90s.mp4`** | **1920×1080** master (+ mobile B-roll) | [PROFESSIONAL_DEMO_VIDEO_PRODUCTION.md](./PROFESSIONAL_DEMO_VIDEO_PRODUCTION.md) |
| `REVIEW_FULL_PLATFORM_WALKTHROUGH.mp4` | **1920×1080** desktop | [REVIEW_VIDEO_MASTER_SCRIPT.md](./REVIEW_VIDEO_MASTER_SCRIPT.md) |
| `REVIEW_MOBILE_PAYMENT_DEMO.mp4` | **390×844** (or device native) | Mobile section below + master script §10 NFC |

**Save to:** `assets/compliance/` (see [assets/compliance/README.md](../assets/compliance/README.md))

**90s investor/compliance cut:** follow [PROFESSIONAL_DEMO_RECORDING_SEQUENCE.md](./PROFESSIONAL_DEMO_RECORDING_SEQUENCE.md); OBS settings below apply to desktop segments.

Legacy filenames (`PAYMENT_FLOW_SCREEN_RECORDING.mp4`, `MOBILE_PAYMENT_DEMO.mp4`) are superseded for this review pack — use the `REVIEW_*` names in submissions.

---

## Before you record

### Environment

1. **URL:** https://tipguardsa.co.za only (padlock visible).
2. **Vercel env (production demo polish):**
   - `VITE_COMPLIANCE_DEMO_MODE=true` — hides Paystack test banner and `build:*` badge ([complianceDemo.ts](../src/lib/complianceDemo.ts))
   - `VITE_PAYSTACK_PUBLIC_KEY=pk_test_…` — test charges only
   - Do **not** set `VITE_TIPGUARD_VERBOSE=true` on the recording build
3. **Data:** `npm run seed:demo` (needs `SUPABASE_URL` + `SUPABASE_SERVICE_ROLE_KEY` in `.env`)
4. **Browser:** Chrome latest, incognito, zoom 100%, bookmarks bar hidden.

### Hide devtools & secrets

- Close DevTools (F12) for entire recording.
- Never show: passwords after login, `sk_*`, service role, `.env`, Supabase secret screens.
- Blur or cut if notification shows email OTP.

### Demo accounts

| Role | Email | Password |
|------|-------|----------|
| Customer | `demo-customer@tipguard.staging` | `TipGuardDemo2026!` |
| Merchant | `demo-merchant@tipguard.staging` | same |
| Guard | `demo-guard@tipguard.staging` | same |

Override with `DEMO_PASSWORD` when seeding. Details: [PAYSTACK_REVIEW_DEMO.md](./PAYSTACK_REVIEW_DEMO.md).

### Paystack test card

| Field | Value |
|-------|--------|
| Card | `4084084084084081` |
| Expiry | any future date |
| CVV | `408` |
| OTP | `123456` |

---

## Option A — OBS Studio (recommended, desktop walkthrough)

1. Install [OBS Studio](https://obsproject.com/).
2. **Settings → Video:** Base and Output **1920×1080**, **30 FPS**.
3. **Settings → Output → Recording:**
   - Format: **MP4** (or MKV then **File → Remux Recordings** to MP4)
   - Encoder: hardware (Apple VT / NVENC) if available
4. **Sources:**
   - **Window Capture** (Chrome only) — preferred; crop to show URL bar
   - or **Display Capture** if you need full screen
5. **Audio:** Mic on if narrating [REVIEW_VIDEO_MASTER_SCRIPT.md](./REVIEW_VIDEO_MASTER_SCRIPT.md); else mute.
6. **Start Recording** at script 0:00; **Stop** at ~7:30.
7. Rename output to `REVIEW_FULL_PLATFORM_WALKTHROUGH.mp4`.

### OBS checklist

- [ ] “Show cursor” enabled if demonstrating clicks
- [ ] No OBS “Recording saved” overlay in frame
- [ ] Browser zoom 100%; dark mode consistent with brand

---

## Option B — Loom (quick desktop)

1. Loom extension → **Screen only** → Chrome tab `tipguardsa.co.za`.
2. Follow [REVIEW_VIDEO_MASTER_SCRIPT.md](./REVIEW_VIDEO_MASTER_SCRIPT.md).
3. Download MP4 → rename to `REVIEW_FULL_PLATFORM_WALKTHROUGH.mp4`.
4. Re-export at 1080p if Loom defaulted to 720p.

---

## Option C — macOS QuickTime (desktop)

1. **File → New Screen Recording** → select browser window.
2. **File → Export As → 1080p**.
3. Rename to `REVIEW_FULL_PLATFORM_WALKTHROUGH.mp4`.

---

## REVIEW_MOBILE_PAYMENT_DEMO.mp4

Record on a **physical phone** (second clip, ~3–4 min). Upload alongside desktop walkthrough.

### Capture settings

| Setting | Value |
|---------|--------|
| Resolution | **390×844** logical (iPhone 14 Pro viewport) or native 1080×1920 portrait |
| FPS | 30 |
| Tool | iOS **Screen Recording** (Control Center) or Android **Developer options → Record screen** |
| Browser | Chrome (Android) or Safari (iOS) |

### Mobile script (timestamps)

| Time | Action |
|------|--------|
| 0:00–0:20 | Open `https://tipguardsa.co.za/tip/demo-staging-qr-01` |
| 0:20–1:00 | Sign in as demo customer |
| 1:00–2:30 | R10 or R20 → Pay → Paystack mobile UI → test card |
| 2:30–3:30 | `/payment/success` on phone |
| 3:30–4:00 | **Android:** NFC tap → tip page. **iOS:** QR fallback only (no Web NFC) |

Export MP4 → `assets/compliance/REVIEW_MOBILE_PAYMENT_DEMO.mp4`.

---

## Editor timeline (REVIEW_FULL_PLATFORM_WALKTHROUGH)

Copy from master script TOC:

| In | Out | Chapter |
|----|-----|---------|
| 0:00 | 0:30 | Intro / HTTPS / footer |
| 0:30 | 1:00 | Customer login |
| 1:00 | 2:05 | QR tip + Paystack pay |
| 2:05 | 3:00 | Payment success |
| 3:00 | 4:30 | Merchant onboarding + QR admin |
| 4:30 | 5:15 | Merchant dashboard / tx |
| 5:15 | 5:35 | Guard (optional) |
| 5:35 | 6:00 | NFC / QR fallback |
| 6:00 | 6:40 | Contact, terms, refund |
| 6:40 | 7:30 | Closing / webhooks |

Add chapter markers in your editor (Premiere, DaVinci, iMovie) at these points.

---

## Storyboard screenshots (optional)

PNG storyboard frames may live in `assets/compliance/screenshots/` (committed). Filenames:

| File | Scene |
|------|--------|
| `01-landing.png` | Home + footer |
| `02-login.png` | Login page |
| `03-tip-landing.png` | `/tip/demo-staging-qr-01` |
| `04-contact.png` | `/contact` |
| `05-terms.png` | `/terms` |
| `06-refunds.png` | `/legal/refunds` |

Capture manually or via browser automation; **no synthetic MP4**.

---

## Pre-upload checklist (Paystack)

- [ ] URL bar shows `tipguardsa.co.za` during tip and success
- [ ] Paystack Inline visible (not full redirect to unrelated site)
- [ ] Success: `/payment/success?ref=`
- [ ] Compliance URLs shown: contact, terms, refund
- [ ] No secrets or passwords on screen
- [ ] MP4 plays in VLC / QuickTime; prefer &lt; 100 MB each
- [ ] Submission references **TipGuard SA** and domain **tipguardsa.co.za**

---

## Where to attach

1. Paystack merchant application **Documents**, or  
2. Email support with hosted links (Drive/S3) if files are not in git.

---

## Option D — 90s professional demo (OBS composite)

1. Record clips per [PROFESSIONAL_DEMO_RECORDING_SEQUENCE.md](./PROFESSIONAL_DEMO_RECORDING_SEQUENCE.md).
2. **OBS / editor:** 1920×1080 @ 30fps; import mobile portrait clips (scale to ~40% width, centre or PiP).
3. Add [PROFESSIONAL_DEMO_VOICEOVER.md](./PROFESSIONAL_DEMO_VOICEOVER.md) + [PROFESSIONAL_DEMO_CAPTIONS.md](./PROFESSIONAL_DEMO_CAPTIONS.md).
4. Export **`TipGuard_SA_Compliance_Demo_90s.mp4`** → `assets/compliance/`.

**Loom:** acceptable for single desktop legal montage only; prefer OBS for URL-bar consistency on payment flow.

---

## Related docs

- [PROFESSIONAL_DEMO_VIDEO_PRODUCTION.md](./PROFESSIONAL_DEMO_VIDEO_PRODUCTION.md) — 60–90s structure
- [REVIEW_VIDEO_MASTER_SCRIPT.md](./REVIEW_VIDEO_MASTER_SCRIPT.md) — full 6–8 min narration
- [VIDEO_RECORDING_GUIDE.md](./VIDEO_RECORDING_GUIDE.md) — legacy filenames / older flow
- [COMPLIANCE_DEMO_STABILIZATION.md](./COMPLIANCE_DEMO_STABILIZATION.md) — deploy + demo QA
