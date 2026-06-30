# page.addInitScript() cannot be removed from a running Playwright page

## What went wrong
When implementing InitScriptManager (phase 41), we needed a way to "remove" init scripts from already-open pages. Playwright/Patchright does not provide an API to undo `page.addInitScript()`. Once called, the script runs on every subsequent navigation for the lifetime of that page context.

## Fix
Accept the limitation: `initRemove()` only removes the script from the store (preventing future injections on new pages). It does not un-install scripts from currently-open pages. Document this clearly in the method. To fully clear injected scripts, the user must close and reopen the page/context.

## Verification
Try calling `page.addInitScript(...)` then navigating — the script runs. There is no `page.removeInitScript()` in the Playwright API surface.
