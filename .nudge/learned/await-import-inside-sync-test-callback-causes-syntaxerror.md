# await import() inside sync test() callback causes SyntaxError

## What went wrong

Using dynamic import inside a synchronous node:test callback:

  test('...', () => {
    const { readFileSync } = await import('node:fs');
    ...
  });

Node.js throws: SyntaxError: Unexpected reserved word
The 'await' keyword is illegal in a non-async function body.

## Fix

Use a top-level static import at the top of the test file instead:

  import { readFileSync } from 'node:fs';

This is the pattern already used in the patchright workaround
(see: importing-browsermanager-in-tests-fails-with-err-module-not-found-for-patchright.md).
Never reach for dynamic import() in test files — static imports work fine
in ES module test files and avoid the async/sync mismatch.

## Verification

node --test test/phase20.test.js → 33 pass after switching to static import.
