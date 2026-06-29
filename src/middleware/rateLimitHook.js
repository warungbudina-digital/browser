const SKIP_PATHS = new Set(['/health', '/metrics']);

/**
 * createRateLimitHook — Fastify preHandler untuk per-key rate limiting.
 *
 * Harus dipasang SETELAH apiKeyHook agar request.keyName sudah tersedia.
 * Endpoint /health dan /metrics dilewati (tidak perlu rate limit).
 *
 * Response 429 jika limit terlampaui, disertai header standar:
 *   X-RateLimit-Remaining, X-RateLimit-Reset, Retry-After
 */
export function createRateLimitHook(rateLimiter) {
  if (!rateLimiter) return null;

  return async function rateLimitPreHandler(request, reply) {
    if (SKIP_PATHS.has(request.url)) return;

    const key    = request.keyName ?? request.ip ?? 'anonymous';
    const result = rateLimiter.consume(key);

    reply.header('X-RateLimit-Remaining', result.remaining);
    reply.header('X-RateLimit-Reset', Math.ceil(result.resetAt / 1000));

    if (!result.allowed) {
      const retryAfter = Math.ceil((result.resetAt - Date.now()) / 1000);
      reply.header('Retry-After', retryAfter);
      reply.code(429).send({
        ok:    false,
        error: 'Rate limit terlampaui — coba lagi dalam ' + retryAfter + ' detik',
        resetAt: result.resetAt,
      });
    }
  };
}
