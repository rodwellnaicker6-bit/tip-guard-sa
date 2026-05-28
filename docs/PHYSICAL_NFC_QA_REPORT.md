# Physical NFC QA report

**Environment:** Production `https://tipguardsa.co.za` · Paystack **test** unless noted  
**Tester:** ______________________ **Date:** __________  
**Build / commit:** ______________________  
**Tags used:** Guard token __________ · Venue token __________ · Corrupt tag __________

> Agent/automation cannot tap hardware. Fill **PASS** / **FAIL** / **NOT RUN** and notes. Attach screen recording per [NFC_VIDEO_RECORDING_GUIDE.md](./NFC_VIDEO_RECORDING_GUIDE.md).

---

## Summary

| Area | Result | Blocker notes |
|------|--------|---------------|
| TAG | | |
| Android | | |
| iPhone | | |
| Payment | | |
| UX | | |
| **Overall Go/No-Go** | | |

---

## TAG — provisioned & malicious payloads

| ID | Scenario | Steps | Expected | Result | Notes |
|----|----------|-------|----------|--------|-------|
| T-01 | Clean read | Official tag `tipguard://tip/{token}` | Resolve OK → tip page with correct guard name | | |
| T-02 | HTTPS deep link tag | URL record `https://tipguardsa.co.za/tip/{token}` | Same as T-01 | | |
| T-03 | Rapid taps | Tap same tag 3× within 2s | Debounce: one navigation; message on duplicates | | |
| T-04 | Corrupt payload | Tag with random text / empty NDEF | Invalid payload message + QR fallback; no crash | | |
| T-05 | Rewritten tag | Clone tag to another venue’s token | Shows **server** guard for that token, not writer’s label | | |
| T-06 | Paystack URL on tag | Write `https://checkout.paystack.com/...` | Rejected; forbidden URL message | | |
| T-07 | Foreign domain | `https://example.com/tip/x` | Rejected | | |
| T-08 | Invalid merchant via JSON | `{"kind":"merchant_card","merchant_id":"..."}` | Rejected; no direct merchant navigation | | |
| T-09 | Expired / revoked token | Use deactivated QR token | Resolve error; no Pay button for wrong guard | | |
| T-10 | Duplicate prevention | Tap → pay once → tap again | Second pay blocked by checkout lock | | |
| T-11 | Multiple tags | Tap tag A then tag B | Correct guard for each after debounce window | | |

---

## Android — Chrome Web NFC

| ID | Scenario | Steps | Expected | Result | Notes |
|----|----------|-------|----------|--------|-------|
| A-01 | Chrome NFC happy path | Guard hub → Scan NFC → tap tag | “Verifying link…” then tip page | | |
| A-02 | Lock / unlock | Mid-scan lock phone 10s → unlock | Scan recovers or safe message + QR CTA | | |
| A-03 | Background restore | Open tip from tag → home → return Chrome | Tip page or auth restore intact | | |
| A-04 | Weak network | Throttle 3G → tap tag | Resolve timeout or stale cache; retry works | | |
| A-05 | Airplane recovery | Airplane on at tap → off → retry | Graceful error then success | | |
| A-06 | Permission denied | Deny NFC if prompted | Message + “Open QR tipping instead” | | |
| A-07 | QR fallback | Force scan fail → QR button | Lands on `/tip/{token}` or customer browse | | |

---

## iPhone — Safari (no Web NFC)

| ID | Scenario | Steps | Expected | Result | Notes |
|----|----------|-------|----------|--------|-------|
| I-01 | Safari QR | Camera / link to `/tip/{token}` | Tip page loads | | |
| I-02 | QR fallback only | Guard hub NFC panel | No crash; QR CTA visible | | |
| I-03 | NFC limits | Attempt NFC UI | Unsupported copy; no permission loop | | |
| I-04 | Deep-link stability | Open link from WhatsApp / Mail | Same tip page; no blank WebView | | |
| I-05 | Add to Home Screen | PWA open `/tip/{token}` | Renders; pay flow test optional | | |

---

## Payment — tap / QR / auth / webhook

| ID | Scenario | Steps | Expected | Result | Notes |
|----|----------|-------|----------|--------|-------|
| P-01 | Tap → init | NFC → sign in → Pay R20 | Paystack modal opens once | | |
| P-02 | Tap → QR fallback | Fail NFC → QR same token | Same guard after resolve | | |
| P-03 | Tap → auth restore | Pay logged out → login → return | Lands on `/tip/{token}?amount=…` | | |
| P-04 | Success | Test card 408408… | `/payment/success` | | |
| P-05 | Cancel | Dismiss Paystack | Idle; can retry | | |
| P-06 | Reconnect | Drop network during pay → restore | Error or resume; no duplicate charge | | |
| P-07 | Webhook | After success check Supabase | `transactions` / events updated | | |
| P-08 | Dedupe | Replay webhook / double notify | Single settled tip | | |

---

## UX

| ID | Scenario | Expected | Result | Notes |
|----|----------|----------|--------|-------|
| U-01 | Instant feedback | “Listening…” / “Verifying link…” within 500ms | | |
| U-02 | Loading states | No infinite spinner >15s without error | | |
| U-03 | Graceful fallback | Every failure path offers QR | | |
| U-04 | No blank screen | No white screen on tap | | |
| U-05 | No crash | No tab kill / reload loop | | |
| U-06 | No redirect loop | Login ↔ tip stable | | |

---

## Sign-off

| Role | Name | Signature | Date |
|------|------|-----------|------|
| Operator | | | |
| Engineering | | | |

**Recording file:** `NFC_PAYMENT_FLOW_RECORDING.mp4` (not committed — see video guide)
