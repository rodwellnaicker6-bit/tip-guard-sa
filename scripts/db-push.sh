#!/usr/bin/env bash
# Apply Supabase migrations + seed demo data (requires CLI login once).
set -euo pipefail
cd "$(dirname "$0")/.."

PROJECT_REF="${SUPABASE_PROJECT_REF:-fyjmujhlqpvfryelnfum}"

echo "TipGuard — db push (project: $PROJECT_REF)"
echo "If not logged in, run: npx supabase login"
echo ""

if [[ -z "${SUPABASE_ACCESS_TOKEN:-}" ]] && ! npx supabase projects list &>/dev/null; then
  echo "Not authenticated. Run: npx supabase login"
  exit 1
fi

npx supabase link --project-ref "$PROJECT_REF" 2>/dev/null || true
npx supabase db push --yes

echo ""
echo "Seeding demo data…"
npm run seed:demo

echo ""
npm run verify:supabase
