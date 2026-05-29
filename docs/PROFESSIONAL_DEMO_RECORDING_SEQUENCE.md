# TipGuard SA — Professional demo recording sequence

**Output:** `assets/compliance/TipGuard_SA_Compliance_Demo_90s.mp4`  
**Production doc:** [PROFESSIONAL_DEMO_VIDEO_PRODUCTION.md](./PROFESSIONAL_DEMO_VIDEO_PRODUCTION.md)  
**Voiceover:** [PROFESSIONAL_DEMO_VOICEOVER.md](./PROFESSIONAL_DEMO_VOICEOVER.md)

---

## Recommended order (optimal for one editor session)

**Do not record strictly timeline order.** Record **dependencies first**, then **hero payment**, then **proof**, then **pickups**.

| Step | What to record | Device | Why this order |
|------|----------------|--------|----------------|
| **0** | Complete [pre-flight](./PROFESSIONAL_DEMO_VIDEO_PRODUCTION.md#pre-flight-checklist-mandatory) | — | Avoid unusable master |
| **1** | Legal montage: Contact, Terms, Privacy, Refunds | Desktop | Static; easy retakes; no auth |
| **2** | Landing hero (intro + end B-roll) | Desktop | Same session lighting/scale |
| **3** | Merchant dashboard **B-roll** (seeded tips) | Desktop | Dashboard works before live pay via `seed:demo` |
| **4** | Merchant `/merchant/qr` — copy link showing domain | Desktop | 10s; use in merchant section or cut |
| **5** | **Live mobile QR payment** → `/payment/success` | Mobile | Hero clip; creates fresh transaction |
| **6** | Merchant dashboard **refresh** — highlight new row | Desktop | 5–8s; matches step 5 amount/time |
| **7** | Android NFC tap → tip page (same token) | Mobile | Differentiation; no second full payment required |
| **8** | iPhone: NFC panel → **Open QR tipping instead** → tip page | Mobile | Honest fallback; 5s total |
| **9** | Pickups: URL bar, Paystack modal close-up, success ref | Either | Only if steps 5–6 had issues |
| **10** | Voiceover + music + title/end cards | Post | Not in app |

### Merchant first vs payment first?

| Strategy | When to use |
|----------|-------------|
| **Payment first (recommended)** | Final video must show **one tip line** that matches the payment you just filmed. Record step 5, then step 6. |
| **Merchant B-roll first (step 3)** | Safe establishing shots using **seeded** sample tips; do not claim a specific row is “the payment you saw” unless step 6 confirms it. |

**Answer:** Record **merchant dashboard B-roll first** only as generic establishing footage; record **live QR payment before the “matching transaction” merchant clip**. Never record merchant-after-payment before payment — you will waste a take.

---

## Detailed step-by-step (≈45–60 min set)

### Step 0 — Pre-flight (10 min)

1. Confirm Vercel: `VITE_COMPLIANCE_DEMO_MODE=true`, `pk_test_…`, verbose off.  
2. `npm run verify:supabase`  
3. Open https://tipguardsa.co.za/tip/demo-staging-qr-01 — guard name loads in &lt;10s.  
4. Sign in customer on phone; sign in merchant on desktop (separate profiles).  
5. Close DevTools; hide notifications; charge phones.

### Step 1 — Compliance pages (5 min, desktop)

1. https://tipguardsa.co.za/contact — scroll to business contact (~3s hold).  
2. https://tipguardsa.co.za/terms — header visible (~3s).  
3. https://tipguardsa.co.za/privacy — (~3s).  
4. https://tipguardsa.co.za/legal/refunds — (~3s).  

Record as **one continuous OBS take** or four short clips.

### Step 2 — Landing (2 min, desktop)

1. https://tipguardsa.co.za/ — full viewport, URL bar visible, 5s static.  
2. Optional slow scroll to footer legal links (3s).  

### Step 3 — Merchant B-roll (3 min, desktop)

1. https://tipguardsa.co.za/merchant as `demo-merchant@tipguard.staging`.  
2. Pan summary cards + tip list (no mouse frenzy).  
3. Stop — **do not** narrate specific row yet.

### Step 4 — Merchant QR (2 min, desktop)

1. https://tipguardsa.co.za/merchant/qr  
2. Copy link — show clipboard preview or address bar with `tipguardsa.co.za/tip/…`  

### Step 5 — Live customer payment (8–12 min, mobile)

1. Log out customer on phone (clean tip state).  
2. https://tipguardsa.co.za/tip/demo-staging-qr-01  
3. Sign in `demo-customer@tipguard.staging`.  
4. **R20** → **Pay** → Paystack test card `4084084084084081`, CVV `408`, OTP `123456` if asked.  
5. Hold **/payment/success** 3s with reference visible.  

**If fail:** one hard refresh + one retry; third fail → stop and fix deploy ([COMPLIANCE_DEMO_STABILIZATION.md](./COMPLIANCE_DEMO_STABILIZATION.md)).

### Step 6 — Merchant proof (2 min, desktop)

1. Refresh https://tipguardsa.co.za/merchant  
2. Highlight row matching step 5 (amount + recent time).  
3. 5–8s steady shot — this is the **money proof** pairing.

### Step 7 — Android NFC (5 min, mobile)

1. Chrome, HTTPS, guard/venue flow with physical tag.  
2. Tap → “Verifying link…” → tip page for `demo-staging-qr-01`.  
3. **Stop at tip page** (no second payment) unless you need a spare success clip.

### Step 8 — iPhone fallback (3 min, mobile)

1. Safari — open NFC entry that shows unsupported Web NFC.  
2. Tap **Open QR tipping instead**.  
3. Land on https://tipguardsa.co.za/tip/demo-staging-qr-01 — hold 3s.

### Step 9 — Pickups (optional)

- Desktop: freeze-frame Paystack modal from step 5 screen recording.  
- Mobile: URL bar on tip + success pages.  

### Step 10 — Post-production assembly

1. Import clips → align to [PROFESSIONAL_DEMO_VIDEO_PRODUCTION.md](./PROFESSIONAL_DEMO_VIDEO_PRODUCTION.md) timestamps.  
2. Lay [PROFESSIONAL_DEMO_VOICEOVER.md](./PROFESSIONAL_DEMO_VOICEOVER.md) or [PROFESSIONAL_DEMO_CAPTIONS.srt](./PROFESSIONAL_DEMO_CAPTIONS.srt).  
3. Add 0.3s transitions; optional royalty-free music (duck under VO).  
4. Title card 0:00; end card 1:10.  
5. Export `TipGuard_SA_Compliance_Demo_90s.mp4` → `assets/compliance/`.  

---

## Single-take “live demo” order (if not editing)

Only if presenting **live** to investors without post — still sign in merchant beforehand:

1. Intro landing (5s)  
2. Mobile QR pay + success (25s)  
3. Desktop merchant refresh (15s)  
4. Android NFC + iPhone fallback (15s)  
5. Legal flash (10s)  
6. End landing (5s)  

**Risk:** over 90s and fragile on payment failure — **not recommended** for compliance submit.

---

## Retake decision tree

```
Payment failed?
  ├─ Yes → fix env/seed → redo Step 5 only
  └─ No → Merchant missing row?
        ├─ Yes → refresh → redo Step 6 only
        └─ No → NFC wrong URL?
              ├─ Yes → reprogram tag → redo Step 7–8
              └─ No → assemble in post
```

---

## Files after session

| File | Location |
|------|----------|
| Raw desktop OBS | `~/Movies` or project scratch (not in git) |
| Raw mobile `.mp4` | AirDrop to workstation |
| Final master | `assets/compliance/TipGuard_SA_Compliance_Demo_90s.mp4` |

See [assets/compliance/README.md](../assets/compliance/README.md).
