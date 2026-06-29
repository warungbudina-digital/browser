/**
 * createApiKeyHook — Fastify preHandler yang memeriksa Bearer token.
 * Return null jika API_KEY tidak dikonfigurasi (mode open, development).
 */
export function createApiKeyHook(apiKey) {
  if (!apiKey) return null;

  return async function apiKeyPreHandler(request, reply) {
    // Rute publik yang tidak memerlukan auth
    if (request.url === '/health' || request.url === '/metrics') return;

    const auth  = request.headers['authorization'] ?? '';
    const token = auth.startsWith('Bearer ') ? auth.slice(7) : '';

    if (token !== apiKey) {
      reply.code(401).send({ ok: false, error: 'Unauthorized — sertakan header: Authorization: Bearer <API_KEY>' });
    }
  };
}
