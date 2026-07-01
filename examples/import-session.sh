#!/usr/bin/env bash
# Import session TikTok (atau platform lain) dari file cookies.txt (format Netscape)
# hasil export ekstensi browser "Get cookies.txt LOCALLY" (atau sejenisnya) di
# browser pribadi kamu — bukan browser automation di project ini.
#
# Alur:
#   1. Login manual ke platform target (mis. tiktok.com) di browser kamu sendiri.
#   2. Export cookies.txt pakai ekstensi tsb.
#   3. Jalankan script ini untuk load cookies itu ke profile browser automation
#      dan simpan ke SessionStore — job scraping berikutnya untuk profile+platform
#      ini otomatis pakai session yang sudah login (lihat JobQueue.js).
#
# Usage: ./import-session.sh <path-ke-cookies.txt> <platform> [profile]
set -euo pipefail

COOKIES_FILE="${1:?Usage: import-session.sh <cookies.txt> <platform> [profile]}"
PLATFORM="${2:?Usage: import-session.sh <cookies.txt> <platform> [profile]}"
PROFILE="${3:-openclaw}"

BASE="${FULL_TOOL_BROWSER_URL:-http://localhost:8080}"
API_KEY="${API_KEY:-}"

[[ -f "$COOKIES_FILE" ]] || { echo "File tidak ditemukan: $COOKIES_FILE" >&2; exit 1; }

echo "=== Import session '$PLATFORM' ke profile '$PROFILE' dari $COOKIES_FILE ==="

jq -Rs --arg platform "$PLATFORM" '{platform: $platform, cookiesTxt: .}' "$COOKIES_FILE" \
  | curl -sS -X POST "$BASE/sessions/$PROFILE/import" \
      ${API_KEY:+-H "Authorization: Bearer $API_KEY"} \
      -H "Content-Type: application/json" \
      -d @-
echo ""

echo ""
echo "=== Verifikasi ==="
curl -sS "$BASE/sessions/$PROFILE" ${API_KEY:+-H "Authorization: Bearer $API_KEY"}
echo ""
