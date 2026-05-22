# Push notifications (scaffold)

Full FCM / Web Push is **not** enabled in this repo — no VAPID or Firebase keys are committed.

## Planned stack

1. **Web Push** — service worker + `push` event (see `public/sw-push.stub.js`, commented)
2. **Supabase** — `notifications` table + Edge Function to fan out (migration `20260620120000_mvp_phase2_sessions_notifications.sql`)
3. **Email** — `notify-payment` Edge Function (Resend); returns `{ sent: false, reason: "notifications_disabled" }` until secrets are set
4. **FCM** — optional native wrapper post-MVP

### `notify-payment` (scaffold)

Deploy: `supabase functions deploy notify-payment`

Secrets (optional until go-live):

```bash
RESEND_API_KEY=re_...
NOTIFY_FROM_EMAIL=payments@yourdomain.com
```

Invoke with `{ "reference": "<paystack_ref>", "event": "tip_succeeded" }`. Wire from `post_tip_settlement_hooks` when ready — not called automatically in MVP.

## Env vars (future)

```bash
# VITE_FIREBASE_VAPID_KEY=
# VITE_FCM_SENDER_ID=
```

## Enabling later

1. Generate VAPID keys and store in Supabase secrets
2. Uncomment `public/sw-push.stub.js` and register in `main.tsx` behind `VITE_ENABLE_PUSH=true`
3. Subscribe after user gesture; store `push_subscription` JSON per profile (new migration)
4. Send via Edge Function using web-push library

## POPIA

Record consent in profile metadata or a `notification_preferences` row before marketing pushes.
