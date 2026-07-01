# npm test hangs forever on phase10.test.js — dangling setInterval in SseManager

## What went wrong

`npm test` runs `node --test <fixed file list>` with `--test-timeout=0` (no
timeout, confirmed via `ps aux` showing that flag on the child process).
`src/events/SseManager.js:33` starts a `setInterval` (SSE heartbeat) that is
never `.unref()`'d or cleared. `test/phase10.test.js` exercises `SseManager`
without ever tearing an instance down. All 12 tests in that file pass
individually and quickly (confirmed via `node --test test/phase10.test.js`
directly), but the child process never exits afterward because the event
loop still has the live interval — so the overall `npm test` run just hangs
indefinitely at that file, forever, with no error and no way to tell it's
stuck versus still working (the "phase" file naming makes it look like
normal progress). Confirmed pre-existing on unmodified `main` via `git
stash` + rerun — not caused by any feature-specific change.

## Fix

Not yet fixed (flagging only). Either:
1. `.unref()` the interval in `SseManager.js` so it doesn't keep the process
   alive when nothing else is pending, or
2. Add a `close()`/`destroy()` method that clears the interval, and call it
   at the end of the relevant tests in `phase10.test.js`.

## Verification

```bash
# Reproduces the hang (kill after a few seconds — it will not exit on its own):
timeout 20 node --test test/phase10.test.js; echo "exit: $?"   # 124 = timed out

# Workaround to run the rest of the suite without hitting the hang:
FILES=$(node -e "console.log(JSON.parse(require('fs').readFileSync('package.json')).scripts.test.replace('node --test ','').split(' ').filter(f=>f!=='test/phase10.test.js').join(' '))")
node --test $FILES
```
