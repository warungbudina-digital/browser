# page.evaluate() function must be fully self-contained — no external imports or closures

## What went wrong

When passing an exported function to Playwright/Patchright \`page.evaluate(myFn)\`, the function body is serialized as a string and re-evaluated inside the browser VM. This means:

- Module-level imports are NOT available inside the function body
- Closures over variables defined outside the function silently break
- References to \`WeakSet\`, \`CSS.escape\`, \`document\`, etc. must exist natively in browser

Symptom: function runs in Node.js tests fine but throws \`ReferenceError\` or returns wrong data when called via \`page.evaluate()\`.

Example pitfall (phase 14, ContentExtractor.js):
\`\`\`js
// WRONG — captures external module variable
import { SELECTOR } from './constants.js';
export function textCollector() {
  document.querySelectorAll(SELECTOR); // ReferenceError in browser
}

// CORRECT — fully self-contained
export function textCollector() {
  const SELECTOR = 'h1,h2,p,ul,ol'; // define inline
  document.querySelectorAll(SELECTOR);
}
\`\`\`

## Fix

Each DOM collector function exported for \`page.evaluate()\` must be entirely self-contained: no imports, no closure captures, no references to Node.js globals. All constants and helpers must be defined inline inside the function body.

## Verification

Run the function via \`page.evaluate(fn)\` against a live page (not just Node.js unit tests). Unit tests pass regardless because they run in Node.js, not a browser VM.
