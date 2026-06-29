#!/usr/bin/env bash
set -euo pipefail

BASE_URL="${FULL_TOOL_BROWSER_URL:-http://127.0.0.1:8080}"
REQ="$BASE_URL/browser/request"

post() {
  curl -sS -X POST "$REQ" \
    -H 'content-type: application/json' \
    -d "$1"
  echo
}

curl -sS "$BASE_URL/browser/capabilities" && echo
post '{"action":"start","profile":"openclaw"}'
post '{"action":"open","profile":"openclaw","url":"https://example.com"}'
post '{"action":"snapshot","profile":"openclaw","interactive":true}'
# replace e1 with a real ref from the snapshot output
post '{"action":"act","profile":"openclaw","request":{"kind":"click","ref":"e1"}}'
post '{"action":"screenshot","profile":"openclaw","fullPage":true}'
