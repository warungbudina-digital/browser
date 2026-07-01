# package.json's "test" script silently omits test/phase48–phase53.test.js

## What went wrong

`package.json`'s `test` script hardcodes an explicit file list for
`node --test` (this is itself intentional — see the existing note on
`phase10.test.js`'s dangling `setInterval` hang). That list currently jumps
from `test/phase47.test.js` straight to `test/tiktok-growth-os-bridge.test.js`
and `test/cookies-txt-parser.test.js` — it never mentions
`test/phase48.test.js` through `test/phase53.test.js`, even though all six
files exist on disk (`test/phase48.test.js` … `test/phase53.test.js`,
covering later phases like the Cache API manager and media player manager).

Confirmed via:
```bash
grep -o "test/phase[0-9]*\.test\.js" package.json | sort -V | uniq > /tmp/in_pkg.txt
find test -maxdepth 1 -iname "phase*.test.js" | sort -V > /tmp/on_disk.txt
diff /tmp/in_pkg.txt /tmp/on_disk.txt
# > test/phase48.test.js .. test/phase53.test.js only in on_disk.txt
```

`npm test` reports success while silently never executing those 6 files —
no error, no warning, just missing coverage. Easy to assume "the suite
passed" covers everything when it doesn't.

## Fix

Not fixed in this pass (found incidentally while adding a new test file for
an unrelated feature — the fix belongs to whoever owns the phase48-53
work, not this session). To fix: add
`test/phase48.test.js test/phase49.test.js test/phase50.test.js
test/phase51.test.js test/phase52.test.js test/phase53.test.js` to the
`test` script in `package.json` (order doesn't matter, `node --test` runs
files independently), then run each once standalone first in case any of
them shares phase10's dangling-handle problem before adding it to the full
`npm test` run.

## Verification

```bash
# Confirm the gap still exists:
grep -o "test/phase[0-9]*\.test\.js" package.json | sort -V | uniq > /tmp/in_pkg.txt
find test -maxdepth 1 -iname "phase*.test.js" | sort -V > /tmp/on_disk.txt
diff /tmp/in_pkg.txt /tmp/on_disk.txt

# After fixing, confirm each new file exits cleanly on its own before trusting it in the full run:
node --test test/phase48.test.js
node --test test/phase49.test.js
node --test test/phase50.test.js
node --test test/phase51.test.js
node --test test/phase52.test.js
node --test test/phase53.test.js
```

## Update (2026-07-01) — RESOLVED

`package.json` `test` script kini memakai glob `node --test test/*.test.js`
(shell expand → path eksplisit, bukan auto-discovery). phase48–53 otomatis
tercakup; diverifikasi standalone satu per satu lalu full run: 1333 pass / 0 fail.
File test baru di `test/*.test.js` otomatis ikut ke depannya.
