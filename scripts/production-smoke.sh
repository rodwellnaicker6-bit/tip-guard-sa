#!/usr/bin/env bash
# Production / Paystack-review smoke gates (local or CI)
set -euo pipefail
ROOT="$(cd "$(dirname "$0")/.." && pwd)"
cd "$ROOT"

if [[ -f .env ]]; then set -a; # shellcheck disable=SC1091
  source .env; set +a
elif [[ -f .env.local ]]; then set -a; # shellcheck disable=SC1091
  source .env.local; set +a
fi

echo "=== TipGuard production smoke ==="
echo ""

fail=0

run_gate() {
  local label="$1"
  shift
  if "$@"; then
    echo "✓ $label"
  else
    echo "✗ $label"
    fail=1
  fi
}

run_gate "verify:supabase" npm run verify:supabase
run_gate "verify:paystack" npm run verify:paystack
run_gate "build" npm run build
run_gate "lint" npm run lint

echo ""
echo "Manual / deployed checks (record in PAYSTACK_REVIEW_DEMO.md):"
echo "  [ ] /terms /privacy /legal/refunds /legal/popia /contact"
echo "  [ ] /qr/demo-staging-qr-01 resolves (after seed:demo)"
echo "  [ ] paystack-webhook receives charge.success"
echo "  [ ] Admin /admin/transactions → Run daily reconcile (admin session)"
echo ""

if [[ "$fail" -ne 0 ]]; then
  echo "Smoke failed — fix gates above before Paystack review."
  exit 1
fi
echo "Automated smoke passed."
