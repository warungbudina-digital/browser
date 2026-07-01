const VALID_TOPICS = new Set([
  'job.queued', 'job.started', 'job.completed', 'job.failed', 'job.retry',
  'alert.fired', 'audit.error', '*',
]);

// SSE — real-time event stream (tersedia hanya jika eventBus + sseManager aktif — dicek oleh caller)
export function registerEventRoutes(app, { eventBus, sseManager }) {
  /**
   * GET /events?topics=job.completed,alert.fired
   *
   * Kosong atau '*' = subscribe ke semua topic.
   * Content-Type: text/event-stream
   */
  app.get('/events', async (req, reply) => {
    const rawTopics = String(req.query.topics ?? '').trim();
    const topics = rawTopics
      ? rawTopics.split(',').map((t) => t.trim()).filter((t) => VALID_TOPICS.has(t))
      : ['*'];

    reply.raw.writeHead(200, {
      'Content-Type':  'text/event-stream',
      'Cache-Control': 'no-cache',
      'Connection':    'keep-alive',
      'X-Accel-Buffering': 'no', // disable nginx buffering
    });

    // Kirim komentar awal agar client tahu koneksi berhasil
    reply.raw.write(': connected topics=' + topics.join(',') + '\n\n');

    sseManager.add(reply, eventBus, topics);

    // Fastify tidak boleh menutup response sendiri — biarkan SSE tetap terbuka
    await new Promise((resolve) => reply.raw.on('close', resolve));
  });

  /**
   * GET /scraper/jobs/:id/stream — SSE stream spesifik untuk satu job.
   * Otomatis tutup setelah menerima event job.completed atau job.failed untuk job ini.
   */
  app.get('/scraper/jobs/:id/stream', async (req, reply) => {
    const { id } = req.params;

    reply.raw.writeHead(200, {
      'Content-Type':  'text/event-stream',
      'Cache-Control': 'no-cache',
      'Connection':    'keep-alive',
      'X-Accel-Buffering': 'no',
    });
    reply.raw.write(': watching job ' + id + '\n\n');

    let unsubClose;
    const done = new Promise((resolve) => {
      const handler = (topic, data) => {
        if (data.jobId !== id) return;
        try {
          reply.raw.write('event: ' + topic + '\n');
          reply.raw.write('data: ' + JSON.stringify(data) + '\n\n');
        } catch { /* ignore */ }
        if (topic === 'job.completed' || topic === 'job.failed') {
          reply.raw.write('event: stream.end\ndata: {}\n\n');
          resolve();
        }
      };
      unsubClose = eventBus.subscribeMany(
        ['job.started', 'job.completed', 'job.failed', 'job.retry'],
        handler
      );
      reply.raw.on('close', resolve);
    });

    await done;
    if (unsubClose) unsubClose();
    try { reply.raw.end(); } catch { /* ignore */ }
  });

  // Status koneksi SSE untuk /monitor/health
  app.get('/events/status', async () => ({
    ok:          true,
    connections: sseManager.count(),
    topics:      eventBus.knownTopics(),
  }));
}
