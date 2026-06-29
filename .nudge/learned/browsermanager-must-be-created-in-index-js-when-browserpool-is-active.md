# BrowserManager must be created in index.js when BrowserPool is active

## What went wrong
When BrowserPool was added in Phase 4, it needed a reference to BrowserManager to
call createProfile() and dispatch(). BrowserManager was originally created inside
createServer(), so there was no way to share it with the pool before the server
started — a circular dependency.

## Fix
Move BrowserManager construction out of createServer() into index.js, then pass
the instance in via the options object:

```js
// index.js
const browser = new BrowserManager(config.browser);
const pool = new BrowserPool(browser, { size: config.pool.size });
const server = createServer(config, { browser, dataStore, jobQueue, pool });

// server.js
export function createServer(config, { browser: injectedBrowser, ... } = {}) {
  const browser = injectedBrowser ?? new BrowserManager(config.browser);
  ...
}
```

The fallback `?? new BrowserManager(...)` keeps backward compatibility for
callers that don't inject a browser (e.g. tests, CLI).

## Verification
Pool slot names (pool-1, pool-2, pool-3) appear in browser.listProfiles() after
server start. /monitor/pool returns slot status correctly.
