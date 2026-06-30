# Patchright Chromium ignores --remote-debugging-address=0.0.0.0

## What went wrong

The browser-runner Docker service launched Chromium with:
```
--remote-debugging-address=0.0.0.0 --remote-debugging-port=9222
```
But `/proc/net/tcp` inside the container showed Chrome only bound to
`127.0.0.1:9222` (hex `0100007F:2406`). Other containers connecting via
`http://browser:9222` got connection refused.

Root cause: patchright's anti-detection patches intentionally override the
`--remote-debugging-address` flag for security; the binary always binds CDP
to loopback regardless of the flag.

Additional problem: the healthcheck used `wget` which is not installed in
`node:22.16-bookworm-slim`, so the container stayed permanently unhealthy.

## Fix

`src/browser-server.js` — a zero-dependency Node.js HTTP+WebSocket proxy:
- Spawns Chrome on internal port 9223 (loopback only)
- Listens on `0.0.0.0:9222`
- Rewrites `ws://127.0.0.1:9223/...` → `ws://<caller-host>/...` in
  all `/json/*` JSON responses so patchright `connectOverCDP()` gets
  reachable WebSocket URLs

Dockerfile browser-runner stage:
```dockerfile
COPY src/browser-server.js /app/browser-server.js
CMD ["node", "/app/browser-server.js"]
```

Healthcheck (docker-compose.yml) — use `node` instead of `wget`:
```yaml
test: ["CMD-SHELL", "node -e \"require('http').get('http://127.0.0.1:9222/json/version',r=>{process.exit(r.statusCode===200?0:1)}).on('error',()=>process.exit(1))\""]
```

## Verification

```bash
docker inspect browser-browser-1 --format '{{.State.Health.Status}}'
# healthy

curl http://localhost:9222/json/version
# {"Browser":"Chrome/149...","webSocketDebuggerUrl":"ws://browser:9222/..."}

# From runtime container:
curl -s -X POST http://localhost:8080/browser/request \
  -H "Authorization: Bearer $KEY" \
  -d '{"action":"start","profile":"openclaw"}'
# {"ok":true,"profileDriver":"remote-cdp",...}
```
