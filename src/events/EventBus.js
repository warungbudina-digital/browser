import { EventEmitter } from 'node:events';

/**
 * EventBus — internal pub/sub untuk event sistem.
 *
 * Topic naming convention:  "namespace.action"
 *   job.queued, job.started, job.completed, job.failed, job.retry
 *   alert.fired
 *   audit.request
 *
 * Wildcard subscriber '*' menerima semua event sebagai { topic, data }.
 */
export class EventBus extends EventEmitter {
  constructor() {
    super();
    // Banyak SSE connections bisa subscribe → naikkan limit untuk mencegah warning
    this.setMaxListeners(500);
  }

  /**
   * Publish event ke topic dan wildcard '*'.
   * @param {string} topic
   * @param {object} data
   */
  publish(topic, data) {
    super.emit(topic, data);
    super.emit('*', { topic, data });
  }

  /**
   * Subscribe ke satu topic.
   * @param {string} topic
   * @param {(data: object) => void} handler
   */
  subscribe(topic, handler) {
    this.on(topic, handler);
    return () => this.off(topic, handler);
  }

  /**
   * Subscribe ke banyak topics sekaligus.
   * @param {string[]} topics  — gunakan ['*'] untuk semua
   * @param {(topic: string, data: object) => void} handler
   * @returns {() => void}  unsubscribe function
   */
  subscribeMany(topics, handler) {
    const useWildcard = topics.includes('*') || topics.length === 0;

    if (useWildcard) {
      const fn = ({ topic, data }) => handler(topic, data);
      this.on('*', fn);
      return () => this.off('*', fn);
    }

    const fns = topics.map((topic) => {
      const fn = (data) => handler(topic, data);
      this.on(topic, fn);
      return { topic, fn };
    });
    return () => fns.forEach(({ topic, fn }) => this.off(topic, fn));
  }

  /** Daftar topics yang pernah di-publish sejak startup (dari listener names). */
  knownTopics() {
    return [...new Set(this.eventNames().filter((n) => n !== '*'))];
  }
}
