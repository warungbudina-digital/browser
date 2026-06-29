# node --test hangs without explicit file paths

## What went wrong

Running \`node --test\` without specifying file paths (e.g. as background process or in a directory scan mode) causes the test runner to hang indefinitely. Output is incomplete — only partial test results are shown — and the process never exits.

Affected: \`node --test 2>&1\` or \`node --test &\` in this repo.

## Fix

Always pass explicit test file paths:

\`\`\`bash
node --test test/phase9.test.js 2>&1
node --test test/phase14.test.js 2>&1
\`\`\`

Do NOT rely on auto-discovery (\`node --test\` with no args) — it hangs in this project.

## Verification

Running with explicit paths exits cleanly with summary line:
\`ℹ tests N\`, \`ℹ pass N\`, \`ℹ fail 0\`
