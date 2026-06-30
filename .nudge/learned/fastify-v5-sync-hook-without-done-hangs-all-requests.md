# Fastify v5: sync onRequest hook without done callback hangs all requests

## What went wrong

`src/middleware/correlationId.js` exported a **sync** 2-argument hook:

```js
return function correlationIdOnRequest(request, reply) {
  const id = request.headers['x-request-id'] || generateRequestId();
  request.requestId = id;
  reply.header('x-request-id', id);
};
```

In Fastify **v5** (tested v5.9.0), a hook function with 2 parameters that is NOT
`async` and does NOT accept a `done` 3rd callback is treated as returning a
Promise. Since the function returns `undefined` (not a thenable), Fastify v5
waits for a Promise that never resolves → **every request hangs indefinitely**.

Symptom:
- Server starts and logs "incoming request" (request is received)
- No response ever sent — curl exits with code 28 (timeout)
- Log shows NO "request completed" entry after "incoming request"

This worked fine in **Fastify v4** because v4 auto-called done() for sync hooks
that returned undefined. v5 removed this behaviour.

## Fix

Make the hook `async`:

```js
return async function correlationIdOnRequest(request, reply) {
  const id = request.headers['x-request-id'] || generateRequestId();
  request.requestId = id;
  reply.header('x-request-id', id);
};
```

## Verification

Reproduced via minimal test file inside the container:
```js
app.addHook('onRequest', function(req, reply) { /* sync, 2 args */ });
// → hangs
app.addHook('onRequest', async function(req, reply) { /* async */ });
// → works
```

All Fastify hooks (onRequest, preHandler, etc.) in this project must be
`async` or use the 3-arg `(req, reply, done) => { ...; done(); }` form.
