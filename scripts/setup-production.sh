#!/usr/bin/env bash
# Full production setup — run from repo root after configuring .env
set -euo pipefail
export PATH="/opt/homebrew/bin:/usr/local/bin:$PATH"
cd "$(dirname "$0")/.."

echo "=== 1. Homebrew ==="
if command -v brew >/dev/null; then
  brew --version
else
  echo "Install Homebrew from https://brew.sh"
  exit 1
fi

echo ""
echo "=== 2. Supabase CLI ==="
if ! command -v supabase >/dev/null; then
  brew install supabase/tap/supabase
fi
supabase --version

echo ""
echo "=== 3. Database migrations ==="
if [[ -n "${SUPABASE_ACCESS_TOKEN:-}" ]]; then
  npm run db:push:api
elif [[ -n "${DATABASE_URL:-}" ]]; then
  npm run db:apply
elif supabase projects list &>/dev/null 2>&1; then
  supabase link --project-ref "${SUPABASE_PROJECT_REF:-fyjmujhlqpvfryelnfum}" 2>/dev/null || true
  supabase db push --yes
else
  echo "Need one of:"
  echo "  - SUPABASE_ACCESS_TOKEN in .env → npm run db:push:api"
  echo "  - DATABASE_URL in .env → npm run db:apply"
  echo "  - npx supabase login → supabase db push"
  exit 1
fi

echo ""
echo "=== 4. Auth redirect URLs ==="
if [[ -n "${SUPABASE_ACCESS_TOKEN:-}" ]]; then
  npm run auth:configure
else
  echo "Set redirect URLs manually in Dashboard (see docs/AUTH_SUPABASE_LOCAL.md)"
fi

echo ""
echo "=== 5. Demo seed ==="
npm run seed:demo

echo ""
echo "=== 6. Verify ==="
npm run verify:supabase
npm run test:auth

echo ""
echo "=== Done ==="
