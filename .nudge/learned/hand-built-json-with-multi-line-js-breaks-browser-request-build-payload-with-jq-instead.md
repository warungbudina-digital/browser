# Hand-built JSON with multi-line JS breaks /browser/request — build payload with jq instead

## What went wrong

`examples/itemku-scrape.sh` built its `evaluate` request body by interpolating
a multi-line JS function directly into a hand-written JSON string in bash:
```bash
req "{
  \"action\": \"act\",
  ...
  \"expression\": \"(function() {
    var products = [];
    ...
  }())\"
}"
```
This produced two distinct bugs:
1. The JS source contained raw, unescaped newline characters inside a JSON
   string literal. JSON strings cannot contain literal control characters —
   the server rejected it with `FST_ERR_CTP_INVALID_JSON_BODY: Body is not
   valid JSON but content-type is set to 'application/json'`.
2. Even with valid JSON, the key was `"expression"` — but `BrowserService.js`'s
   `evaluate` case (src/browser/BrowserService.js) reads `request.fn`, not
   `request.expression`. Wrong field name silently passes the request through
   (no top-level validation error) but `new Function(...)` gets `undefined` as
   its source.

## Fix

Never hand-interpolate multi-line strings into JSON in bash. Build the
payload with `jq -n`, which handles all escaping (newlines, quotes) correctly
regardless of the JS source's formatting:

```bash
EXTRACT_FN='() => { ... arbitrary multi-line JS, double quotes for DOM
  strings since the outer literal is single-quoted ... }'
PAYLOAD=$(jq -n --arg profile "$PROFILE" --arg fn "$EXTRACT_FN" \
  '{action: "act", profile: $profile, request: {kind: "evaluate", fn: $fn}}')
curl -sS -X POST "$REQ" -H "Content-Type: application/json" -d "$PAYLOAD"
```

This also sidesteps the field-name trap since the structure is explicit.

## Verification

```bash
echo "$PAYLOAD" | python3 -c "import sys,json; json.loads(sys.stdin.read())"  # must not raise
# response should be {"ok":true,...,"result":{...}}, not FST_ERR_CTP_INVALID_JSON_BODY
```
