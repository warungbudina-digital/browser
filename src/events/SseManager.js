/**
 * SseManager — kelola koneksi SSE aktif dan fan-out event dari EventBus.
 *
 * Setiap koneksi:
 *   - subscribe ke topics yang dipilih client (default: semua)
 *   - terima keepalive comment setiap KEEPALIVE_MS
 *   - unsubscribe + bersih-bersih saat koneksi tutup
 *
 * Format SSE yang dihasilkan:
 *   event: job.completed\ndata: {...}\n\n
 *   : keepalive\n\n
 */

const KEEPALIVE_MS = 15_000;

export class SseManager {
  /** @type {Set<{ reply: object, unsub: () => void, timer: NodeJS.Timer }>} */
  #connections = new Set();

  /**
   * Tambahkan koneksi SSE baru.
   *
   * @param {import('fastify').FastifyReply} reply  Fastify reply object
   * @param {import('./EventBus.js').EventBus} eventBus
   * @param {string[]} topics  — kosong atau ['*'] untuk semua
   * @returns {{ close: () => void }}
   */
  add(reply, eventBus, topics = []) {
    const unsub = eventBus.subscribeMany(topics, (topic, data) => {
      this.#send(reply, topic, data);
    });

    const timer = setInterval(() => {
      try {
        reply.raw.write(': keepalive\n\n');
      } catch {
        clearInterval(timer);
      }
    }, KEEPALIVE_MS);

    const conn = { reply, unsub, timer };
    this.#connections.add(conn);

    const close = () => {
      unsub();
      clearInterval(timer);
      this.#connections.delete(conn);
    };

    // Bersih-bersih otomatis saat client disconnect
    reply.raw.on('close', close);

    return { close };
  }

  /**
   * Kirim satu event SSE ke reply tertentu.
   * @param {import('fastify').FastifyReply} reply
   * @param {string} topic
   * @param {object} data
   */
  #send(reply, topic, data) {
    try {
      reply.raw.write('event: ' + topic + '\n');
      reply.raw.write('data: ' + JSON.stringify(data) + '\n\n');
    } catch {
      // Client sudah disconnect — abaikan
    }
  }

  /** Jumlah koneksi aktif saat ini. */
  count() {
    return this.#connections.size;
  }

  /** Broadcast satu event ke SEMUA koneksi aktif (tanpa melalui EventBus). */
  broadcast(topic, data) {
    for (const { reply } of this.#connections) {
      this.#send(reply, topic, data);
    }
  }

  status() {
    return { connections: this.#connections.size };
  }
}
