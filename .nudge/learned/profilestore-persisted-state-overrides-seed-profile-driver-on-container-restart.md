# ProfileStore persisted state overrides seed profile driver on container restart

## What went wrong

After switching `openclaw` profile from `driver: managed` to `driver: remote-cdp`
in `config.js` (via the `BROWSER_CDP_URL` env var), the running container still
tried to launch a local Chromium and crashed with:

```
browserType.launchPersistentContext: Executable doesn't exist at
/root/.cache/ms-playwright/chromium_headless_shell-1228/...
```

Root cause: `ProfileStore.load()` merges saved state on top of seed profiles:
```js
const profiles = { ...this.seedProfiles, ...(data?.profiles || {}) };
```

The saved `data/state/profiles.json` had `"driver": "managed"` for `openclaw`
from a previous run, and it silently won over the new `remote-cdp` seed config.

## Fix

When changing `driver` (or any structural profile field) in config, the old
persisted state must be deleted so the seed config takes effect:

```bash
docker exec browser-full-tool-browser-1 rm /data/state/profiles.json
docker compose restart full-tool-browser
```

The file is owned by root (written inside the container) so it cannot be deleted
from the host directly — always delete via `docker exec`.

## Verification

```bash
curl -s -X POST http://localhost:8080/browser/request \
  -H "Authorization: Bearer $API_KEY" \
  -H "content-type: application/json" \
  -d '{"action":"start","profile":"openclaw"}' | grep profileDriver
# "profileDriver":"remote-cdp"
```
