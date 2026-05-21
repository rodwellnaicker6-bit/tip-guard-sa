#!/usr/bin/env bash
# Apply a migration file via Supabase MCP (requires authenticated plugin-supabase-supabase).
# Usage: ./scripts/apply-via-mcp.sh supabase/migrations/20260624120000_repair_core_schema.sql repair_core_schema
set -euo pipefail
FILE="${1:?migration sql path}"
NAME="${2:?migration name}"
PROJECT="${SUPABASE_PROJECT_REF:-fyjmujhlqpvfryelnfum}"
SQL=$(cat "$FILE")
# Output JSON for agent MCP apply_migration call
node -e "
const sql = process.argv[1];
const name = process.argv[2];
const project_id = process.argv[3];
console.log(JSON.stringify({ project_id, name, query: sql }));
" "$(cat "$FILE")" "$NAME" "$PROJECT"
