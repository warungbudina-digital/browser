/**
 * createApiKeyHook — Fastify preHandler untuk API key auth.
 *
 * Mendukung:
 *   - Single key: API_KEY=secret  (keyStore dengan satu entry "default")
 *   - Multi key:  API_KEYS=admin:secret1,bot:secret2  (via KeyStore)
 *
 * Setelah validasi, key name di-attach ke request.keyName
 * agar hook downstream (audit, rate-limit) bisa membacanya.
 *
 * Jika KeyStore kosong (no API_KEY env), auth dinonaktifkan (open/dev mode).
 */
export function createApiKeyHook(keyStore) {
  // Backwards-compat: terima string tunggal (legacy path)
  if (typeof keyStore === 'string') {
    const secret = keyStore;
    return async function apiKeyPreHandler(request, reply) {
      if (request.url === '/health' || request.url === '/metrics') return;
      const auth  = request.headers['authorization'] ?? '';
      const token = auth.startsWith('Bearer ') ? auth.slice(7) : '';
      if (token !== secret) {
        reply.code(401).send({ ok: false, error: 'Unauthorized — sertakan header: Authorization: Bearer <API_KEY>' });
      }
      request.keyName = 'default';
    };
  }

  if (!keyStore || keyStore.isEmpty()) return null;

  return async function apiKeyPreHandler(request, reply) {
    if (request.url === '/health' || request.url === '/metrics') return;

    const auth  = request.headers['authorization'] ?? '';
    const token = auth.startsWith('Bearer ') ? auth.slice(7) : '';
    const entry = keyStore.lookup(token);

    if (!entry) {
      reply.code(401).send({ ok: false, error: 'Unauthorized — sertakan header: Authorization: Bearer <API_KEY>' });
      return;
    }

    request.keyName = entry.name;
  };
}
