# BrowserPool hardcoded managed driver breaks all queued jobs on the slim runtime image

## What went wrong

`src/browser/BrowserPool.js`'s `init()` always created pool profiles (`pool-1`,
`pool-2`, `pool-3`) with `driver: 'managed'`, meaning each queued job (via
`JobQueue`/BullMQ) tries to launch a LOCAL Chromium via
`browserType.launchPersistentContext(...)`. But this repo's `full-tool-browser`
Docker image (`docker-compose.yml`, `runtime` target) is deliberately slim —
no bundled Chromium — and is meant to always drive the separate `browser`
service over CDP (`BROWSER_CDP_URL=http://browser:9222`), exactly like the
`openclaw`/`remote` profiles already do (`src/config.js`). Every job submitted
through `/scraper/jobs` (any platform — instagram/tiktok/twitter, not just
TikTok) failed with:
```
browserType.launchPersistentContext: Executable doesn't exist at
/root/.cache/ms-playwright/chromium_headless_shell-1228/chrome-headless-shell-linux64/chrome-headless-shell
```
This had apparently never been exercised end-to-end in this deployment before
(discovered while first-time end-to-end-testing a real scrape job through the
full pipeline) — only direct `/browser/request` calls against the `openclaw`
profile (which correctly uses `remote-cdp`) had been tested previously.

## Fix

`BrowserPool` constructor now accepts an optional `cdpUrl`; `init()` creates
pool profiles with `driver: 'remote-cdp', cdpUrl` when provided, falling back
to `driver: 'managed'` only if no CDP URL is configured (preserves behavior
for deployments that DO bundle Chromium). Wired in `src/index.js`:
```js
pool = new BrowserPool(browser, {
  size: config.pool.size,
  profilePrefix: config.pool.profilePrefix,
  cdpUrl: config.browser.profiles.remote?.cdpUrl ?? null,
});
```

**Critical**: `BrowserPool.init()` swallows "already exists" errors when
creating a profile — it does NOT update an already-persisted profile's
driver. So after this code fix, the stale `pool-1/2/3` entries already
persisted in `data/state/profiles.json` with `driver: "managed"` must be
manually removed (or the whole file reset) before restarting the container,
or the fix silently does nothing (same pitfall as
[[profilestore-persisted-state-overrides-seed-profile-driver-on-container-restart]]):
```bash
jq 'del(.profiles."pool-1", .profiles."pool-2", .profiles."pool-3")' \
  data/state/profiles.json > /tmp/x && sudo cp /tmp/x data/state/profiles.json
sudo chown $(id -u):$(id -g) data/state/profiles.json
docker compose up -d --build full-tool-browser
```

## Verification

```bash
# After restart, submit any scraper job and poll to completion:
curl -s -X POST http://localhost:8080/scraper/jobs -H "Authorization: Bearer $API_KEY" \
  -H "Content-Type: application/json" -d '{"platform":"tiktok","targetUrl":"https://www.tiktok.com/@tiktok"}'
# GET /scraper/jobs/:id should reach status "done" with a populated profile
# (not "failed" with launchPersistentContext / Executable doesn't exist).
```
