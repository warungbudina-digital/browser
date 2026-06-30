import crypto from 'node:crypto';

/** Generate a new RFC-4122 UUID to use as request correlation ID. */
export function generateRequestId() {
  return crypto.randomUUID();
}

/**
 * Fastify onRequest hook — attach a correlation ID to every request.
 *
 * Behaviour:
 *   - If the incoming request already has an `x-request-id` header, that
 *     value is reused (allows tracing across service boundaries).
 *   - Otherwise a new UUID is generated.
 *   - The ID is exposed as `request.requestId` and echoed back in
 *     the `x-request-id` response header.
 */
export function createCorrelationIdHook() {
  return async function correlationIdOnRequest(request, reply) {
    const id = request.headers['x-request-id'] || generateRequestId();
    request.requestId = id;
    reply.header('x-request-id', id);
  };
}
