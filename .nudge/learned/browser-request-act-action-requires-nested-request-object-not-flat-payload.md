# /browser/request act action requires nested request object, not flat payload

## What went wrong

Calling the `act` action with `kind` and `fn` at the top level of the payload:
```json
{
  "action": "act",
  "profile": "openclaw",
  "targetId": "...",
  "kind": "evaluate",
  "fn": "() => ..."
}
```
Returned:
```
{"ok":false,"error":"Cannot read properties of undefined (reading 'kind')"}
```

Root cause: `BrowserManager.dispatch()` passes `payload.request` (not the whole
payload) to `service.act()`:
```js
case 'act': return service.act({ targetId: payload.targetId, request: payload.request });
```
So `payload.request` is `undefined`, and `act()` tries to read `request.kind`.

## Fix

Nest `kind`, `fn`, `selector`, `ref`, etc. inside a `request` sub-object:
```json
{
  "action": "act",
  "profile": "openclaw",
  "targetId": "b49314ac-...",
  "request": {
    "kind": "evaluate",
    "fn": "() => document.title"
  }
}
```

`targetId` stays at the top level; everything else the act handler needs goes
inside `request`.

## Verification

```bash
curl -s -X POST http://localhost:8080/browser/request \
  -H "Authorization: Bearer $API_KEY" \
  -H "content-type: application/json" \
  -d '{"action":"act","profile":"openclaw","targetId":"<id>","request":{"kind":"evaluate","fn":"()=>document.title"}}' 
# {"ok":true,"kind":"evaluate","result":"..."}
```
