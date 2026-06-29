const SKIP_PATHS = new Set(['/health', '/metrics', '/admin']);

/**
 * Dua Fastify hooks yang bekerja bersama untuk mencatat setiap request:
 *   onRequest  — catat waktu mulai
 *   onResponse — kirim entry ke AuditLogger
 *
 * Path /health dan /metrics tidak dicatat (high-frequency, low-value).
 */
export function createAuditHooks(auditLogger) {
  if (!auditLogger) return null;

  return {
    onRequest: async (request) => {
      request.startMs = Date.now();
    },
    onResponse: async (request, reply) => {
      if (SKIP_PATHS.has(request.url) || request.url.startsWith('/admin')) return;
      auditLogger.log({
        keyName:    request.keyName ?? 'anonymous',
        method:     request.method,
        path:       request.url,
        status:     reply.statusCode,
        durationMs: Date.now() - (request.startMs ?? Date.now()),
        ip:         request.ip ?? null,
      });
    },
  };
}
