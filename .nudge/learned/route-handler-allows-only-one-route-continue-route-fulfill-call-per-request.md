# Route handler allows only one route.continue() / route.fulfill() call per request

## What went wrong
When adding Basic Auth header injection (phase 39) to the BrowserService route handler, the initial design added a second `route.continue()` call after the existing HeaderRuleManager block. Playwright/Patchright throws if any route fulfillment method (continue, fulfill, abort) is called more than once for the same intercepted request.

## Fix
Merge all header modifications into a single `route.continue()` call. The pattern used:
```js
const extraHeaders  = this.headerRuleManager.match(url) || {};
const authInfo      = this.basicAuthManager.match(url);
if (authInfo && !route.request().headers()['authorization']) {
  extraHeaders['authorization'] = `Basic ${authInfo.token}`;
}
if (Object.keys(extraHeaders).length > 0) {
  return route.continue({ headers: { ...route.request().headers(), ...extraHeaders } });
}
return route.continue();
```
Any future header-injecting feature must merge into `extraHeaders`, not add its own `route.continue()` branch.

## Verification
Adding a second `route.continue()` call in the handler and triggering a request throws: "Route is already handled!"
