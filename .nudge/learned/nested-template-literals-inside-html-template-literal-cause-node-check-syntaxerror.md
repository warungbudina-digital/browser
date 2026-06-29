# Nested template literals inside HTML template literal cause node --check SyntaxError

## What went wrong
server.js returns a large HTML string as a backtick template literal from a Fastify
route handler. Inside that HTML, a <script> section was added containing JavaScript
that itself used backtick template literals for generating innerHTML strings:

```js
return `<!DOCTYPE html>...
<script>
  ...innerHTML = rows.map(r => `<div>${r.name}</div>`).join('');
</script>`;
```

node --check fails with:
  SyntaxError: Unexpected token '<'
  (pointing at the backtick of the inner template literal)

The parser sees the inner backtick as closing the outer template literal, leaving
bare HTML tokens as unexpected syntax. This does NOT fail at runtime in some
environments, making it easy to miss without the --check step.

## Fix
Use string concatenation inside <script> sections that are embedded in outer
template literals. Never use backtick template literals inside the HTML template:

```js
// Bad (inside outer template literal)
rows.map(r => `<div>${r.name}</div>`).join('')

// Good
rows.map(r => '<div>' + r.name + '</div>').join('')
```

The existing pool/queue innerHTML builders in server.js already use this pattern
with single-quoted strings — follow that same convention for any new script blocks.

## Verification
node --check src/server.js  # must exit 0 with no SyntaxError
