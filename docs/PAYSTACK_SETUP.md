# Paystack setup (South Africa, ZAR)

TipGuard uses **Paystack** for customer tips and wallet top-ups. Amounts are stored in **cents** (ZAR smallest unit). The Paystack **Initialize Transaction** API and Inline JS expect that same subunit for ZAR.

## Keys

- **Public key** → `VITE_PAYSTACK_PUBLIC_KEY` in `.env` (Vite client). Used by Paystack Inline only.
- **Secret key** → Supabase Edge secret `PAYSTACK_SECRET_KEY` (never in the browser).

## Webhook

1. In [Paystack Dashboard](https://dashboard.paystack.com/) → **Settings** → **API & Webhooks**, add your webhook URL pointing to the deployed `paystack-webhook` function, for example:
   - `https://<PROJECT_REF>.supabase.co/functions/v1/paystack-webhook`
2. Paystack signs payloads with **HMAC SHA512** of the raw body; the Edge function compares the digest to the `x-paystack-signature` header using `PAYSTACK_SECRET_KEY`.
3. Handled events (initial scope): `charge.success` (tips + wallet top-ups), `charge.failed`, `subscription.create` (minimal upsert into `public.subscriptions` when metadata includes `user_id` / `plan_code`), `subscription.not_renew` (marks related rows failed where applicable).

## Channels (card, bank, Apple Pay)

Default initialize payload requests `channels: ["card", "bank", "apple_pay"]`. **EFT / bank** and wallets must be enabled for your Paystack business and region in the dashboard; not every channel is available for every customer or bank. HTTPS is required for live payments.

## Redirects

`paystack-initialize` sets `callback_url` to `${PUBLIC_APP_URL}/payment/success?ref=...` when `PUBLIC_APP_URL` is configured. Inline `callback` / `onClose` in the app also routes to `/payment/success` and `/payment/failure`.

## Subscriptions (minimal)

Create plans in the Paystack Dashboard. Deployed stub: Edge `paystack-create-plan` (authenticated) returns operator documentation only until full subscription checkout is wired.
