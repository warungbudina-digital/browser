# !value check catches empty string — use value == null for null/undefined only

## What went wrong

In phase 17 (SessionPersistence.js), sessionFilename() had this guard:

\`\`\`js
if (!name || typeof name !== 'string') throw new Error('Session name is required');
const trimmed = name.trim();
if (!trimmed) throw new Error('Session name cannot be blank');
\`\`\`

Test called sessionFilename('') and expected the error message to match /blank/i.
Instead, it matched /required/ — because !'' is true in JavaScript, so the first
branch fired before the blank check was reached.

Symptoms: test failure with AssertionError — error message was 'Session name is
required' but test expected /blank/i.

## Fix

Use value == null to catch only null and undefined, letting empty string fall
through to the more specific blank check:

\`\`\`js
if (name == null || typeof name !== 'string') throw new Error('Session name is required');
const trimmed = name.trim();
if (!trimmed) throw new Error('Session name cannot be blank');
\`\`\`

Applies to any validation function that wants to distinguish "value not provided"
(null/undefined) from "value is empty/blank" ('', '   ').

## Verification

node --test test/phase17.test.js passed 27/27 after the fix.
