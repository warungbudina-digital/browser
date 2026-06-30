#!/usr/bin/env bash
# Test scraping daftar produk dari itemku.com menggunakan browser API
set -euo pipefail

BASE="${FULL_TOOL_BROWSER_URL:-http://localhost:8080}"
REQ="$BASE/browser/request"
API_KEY="${API_KEY:-}"
PROFILE="openclaw"

AUTH_HEADER=""
[[ -n "$API_KEY" ]] && AUTH_HEADER="-H \"Authorization: Bearer $API_KEY\""

req() {
  local data="$1"
  curl -sS -X POST "$REQ" \
    ${API_KEY:+-H "Authorization: Bearer $API_KEY"} \
    -H "Content-Type: application/json" \
    -d "$data"
  echo
}

echo "=== [1/4] Start browser session ==="
req "{\"action\":\"start\",\"profile\":\"$PROFILE\"}"

echo ""
echo "=== [2/4] Buka itemku.com ==="
req "{\"action\":\"open\",\"profile\":\"$PROFILE\",\"url\":\"https://www.itemku.com/g/game-currency\"}"

echo ""
echo "=== [3/4] Tunggu halaman load (3 detik) ==="
sleep 3

echo ""
echo "=== [4/4] Ekstrak daftar produk ==="
req "{
  \"action\": \"act\",
  \"profile\": \"$PROFILE\",
  \"request\": {
    \"kind\": \"evaluate\",
    \"expression\": \"(function() {
      var products = [];
      var cards = document.querySelectorAll('[class*=product-card],[class*=ProductCard],[data-testid*=product],[class*=item-card]');
      if (!cards.length) {
        cards = document.querySelectorAll('a[href*=/p/]');
      }
      cards.forEach(function(el) {
        var title = el.querySelector('[class*=title],[class*=name],[class*=Title]');
        var price = el.querySelector('[class*=price],[class*=Price]');
        var seller = el.querySelector('[class*=seller],[class*=shop],[class*=Seller]');
        var img = el.querySelector('img');
        var link = el.tagName === 'A' ? el.href : (el.querySelector('a') || {}).href;
        products.push({
          title: title ? title.innerText.trim() : null,
          price: price ? price.innerText.trim() : null,
          seller: seller ? seller.innerText.trim() : null,
          image: img ? img.src : null,
          url: link || null
        });
      });
      return { count: products.length, products: products.slice(0, 20) };
    }())\"
  }
}"

echo ""
echo "=== Selesai ==="
