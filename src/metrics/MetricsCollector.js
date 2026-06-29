/**
 * MetricsCollector — in-process Prometheus-compatible metrics store.
 * Tidak memerlukan library eksternal. Mendukung counter, gauge, dan summary.
 */
export class MetricsCollector {
  #counters  = new Map(); // 'name{k="v"}' → number
  #gauges    = new Map(); // 'name{k="v"}' → number
  #summaries = new Map(); // 'name{k="v"}' → { sum, count }
  #meta      = new Map(); // name → { type, help }

  #labelKey(name, labels = {}) {
    const pairs = Object.entries(labels)
      .sort(([a], [b]) => a.localeCompare(b))
      .map(([k, v]) => k + '="' + String(v).replace(/\\/g, '\\\\').replace(/"/g, '\\"') + '"')
      .join(',');
    return pairs ? name + '{' + pairs + '}' : name;
  }

  #baseName(key) {
    const i = key.indexOf('{');
    return i === -1 ? key : key.slice(0, i);
  }

  register(name, type, help = '') {
    if (!this.#meta.has(name)) this.#meta.set(name, { type, help });
  }

  inc(name, labels = {}, value = 1) {
    const k = this.#labelKey(name, labels);
    this.#counters.set(k, (this.#counters.get(k) ?? 0) + value);
  }

  set(name, labels = {}, value) {
    this.#gauges.set(this.#labelKey(name, labels), value);
  }

  /** Record a duration observation in seconds. */
  observe(name, labels = {}, seconds) {
    const k = this.#labelKey(name, labels);
    const s = this.#summaries.get(k) ?? { sum: 0, count: 0 };
    s.sum   += seconds;
    s.count += 1;
    this.#summaries.set(k, s);
  }

  toPrometheusText() {
    const lines  = [];
    const emitted = new Set();

    const header = (name, defaultType) => {
      if (emitted.has(name)) return;
      emitted.add(name);
      const meta = this.#meta.get(name);
      if (meta?.help) lines.push('# HELP ' + name + ' ' + meta.help);
      lines.push('# TYPE ' + name + ' ' + (meta?.type ?? defaultType));
    };

    for (const [key, value] of this.#counters) {
      header(this.#baseName(key), 'counter');
      lines.push(key + ' ' + value);
    }

    for (const [key, value] of this.#gauges) {
      header(this.#baseName(key), 'gauge');
      lines.push(key + ' ' + value);
    }

    for (const [key, { sum, count }] of this.#summaries) {
      const name   = this.#baseName(key);
      const labels = key.includes('{') ? key.slice(key.indexOf('{')) : '';
      header(name, 'summary');
      lines.push(name + '_sum'   + labels + ' ' + sum.toFixed(6));
      lines.push(name + '_count' + labels + ' ' + count);
    }

    return lines.join('\n') + '\n';
  }

  snapshot() {
    const counters  = {};
    const gauges    = {};
    const summaries = {};
    for (const [k, v] of this.#counters)  counters[k]  = v;
    for (const [k, v] of this.#gauges)    gauges[k]    = v;
    for (const [k, { sum, count }] of this.#summaries) {
      summaries[k] = { sum, count, avg: count > 0 ? sum / count : 0 };
    }
    return { counters, gauges, summaries };
  }
}

/** Buat dan daftarkan semua metrik standar scraper. */
export function createMetrics() {
  const m = new MetricsCollector();

  m.register('scraper_jobs_total',            'counter', 'Total scraper jobs by platform and status');
  m.register('scraper_retries_total',         'counter', 'Total scraper job retries by platform');
  m.register('scraper_job_duration_seconds',  'summary', 'Scraper job duration in seconds by platform');

  return m;
}
