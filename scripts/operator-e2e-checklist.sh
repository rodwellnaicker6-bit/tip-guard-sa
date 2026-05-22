#!/usr/bin/env bash
# Live Paystack + tip E2E checklist (reads .env; skips when keys missing)
set -euo pipefail
ROOT="$(cd "$(dirname "$0")/.." && pwd)"
cd "$ROOT"

if [[ -f .env ]]; then set -a; # shellcheck disable=SC1091
  source .env; set +a
elif [[ -f .env.local ]]; then set -a; # shellcheck disable=SC1091
  source .env.local; set +a
fi

URL="${VITE_SUPABASE_URL:-${SUPABASE_URL:-}}"
PK="${VITE_PAYSTACK_PUBLIC_KEY:-}"
SK="${PAYSTACK_SECRET_KEY:-}"

echo "=== TipGuard operator E2E checklist ==="
echo ""

if [[ -z "$URL" ]]; then
  echo "SKIP: VITE_SUPABASE_URL / SUPABASE_URL not set — add to .env for automated checks"
  exit 0
fi

echo "1. Automated gates"
if npm run verify:supabase 2>/dev/null; then echo "   ✓ verify:supabase"; else echo "   ✗ verify:supabase (fix before live tip)"; fi
if npm run verify:paystack 2>/dev/null; then echo "   ✓ verify:paystack"; else echo "   ✗ verify:paystack"; fi

echo ""
echo "2. Paystack keys"
if [[ -z "$PK" ]]; then
  echo "   SKIP: VITE_PAYSTACK_PUBLIC_KEY missing"
elif [[ "$PK" == pk_live_* ]]; then
  echo "   LIVE public key detected — use production domain only"
else
  echo "   Test public key ($PK) — switch to pk_live_ for production E2E"
fi
if [[ -z "$SK" ]]; then
  echo "   SKIP: PAYSTACK_SECRET_KEY not in .env (must be in Supabase Edge secrets for webhook)"
else
  echo "   Secret key present in .env (do not commit)"
fi

echo ""
echo "3. Manual live tip (operator)"
echo "   [ ] Open production /t/<valid-token> or scan merchant QR"
echo "   [ ] Pay R10+ with live card (Paystack checkout)"
echo "   [ ] Confirm paystack-webhook Edge log: charge.success"
echo "   [ ] Guard wallet: available increased, transaction status succeeded"
echo "   [ ] Optional: notify-payment log (no crash if Resend unset)"
echo ""
echo "4. Payout smoke (staging first)"
echo "   [ ] Guard: request payout from dashboard"
echo "   [ ] Admin: mark Processing → Paid (uses admin_update_payout_status RPC)"
echo "   [ ] Reject path: pending → Reject releases hold"
echo ""
echo "5. Cron (post-schedule)"
echo "   [ ] process-webhook-retries ran in last 24h (docs/CRON.md)"
echo "   [ ] reconcile-daily log row in reconciliation_log"
echo ""
echo "Webhook URL: ${URL%/}/functions/v1/paystack-webhook"
echo "Done. Record results in docs/BETA_TESTER_CHECKLIST.md"
