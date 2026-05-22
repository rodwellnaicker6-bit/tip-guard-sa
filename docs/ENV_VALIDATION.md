# Environment validation

App boot never blocks on missing optional keys; payment flows surface errors in UI.

## Client (Vite)

| Key | Validation |
|-----|------------|
| `VITE_SUPABASE_URL` | Required for auth/data; boot gate shows connect message if absent |
| `VITE_SUPABASE_ANON_KEY` | Required with URL |
| `VITE_PAYSTACK_PUBLIC_KEY` | Required for checkout; `paystackEnvIssue()` on tip pages |
| `VITE_TIP_PAYMENT_GATEWAY` | Optional; default `paystack` |

## Supabase Edge secrets

| Secret | Functions |
|--------|-----------|
| `PAYSTACK_SECRET_KEY` | initialize, verify, webhook |
| `SUPABASE_SERVICE_ROLE_KEY` | all payment edges |
| `PUBLIC_APP_URL` | initialize callback_url |

Missing `PAYSTACK_SECRET_KEY` returns HTTP 500 with `{ code: "config" }` — does not crash the SPA.
