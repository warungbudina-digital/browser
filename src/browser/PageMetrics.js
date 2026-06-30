/**
 * Page performance metrics utilities — pure, no browser dependency.
 *
 * Works on raw data collected from the browser via page.evaluate()
 * using the Performance API (PerformanceNavigationTiming, PerformancePaintTiming).
 *
 * Core Web Vitals scoring thresholds follow Google's published guidelines.
 */

/** Core Web Vitals and navigation timing thresholds (ms, except CLS which is unitless). */
export const WEB_VITALS_THRESHOLDS = {
  ttfb: { good: 800,  poor: 1800 },
  fcp:  { good: 1800, poor: 3000 },
  lcp:  { good: 2500, poor: 4000 },
  cls:  { good: 0.1,  poor: 0.25 },
  fid:  { good: 100,  poor: 300  },
  inp:  { good: 200,  poor: 500  },
};

/**
 * Normalize a PerformanceNavigationTiming entry into derived durations.
 * All values are in milliseconds relative to fetchStart.
 *
 * @param {{ fetchStart, domainLookupStart, domainLookupEnd, connectStart, connectEnd,
 *           requestStart, responseStart, responseEnd, domContentLoadedEventEnd,
 *           loadEventEnd, redirectCount, type }} entry
 * @returns {{ ttfb, dnsLookup, tcpConnect, requestDuration, domContentLoaded, pageLoad, redirectCount, navigationType }}
 */
export function parseNavigationTiming(entry) {
  const fs = entry.fetchStart ?? 0;
  return {
    ttfb:             (entry.responseStart         ?? 0) - fs,
    dnsLookup:        (entry.domainLookupEnd        ?? 0) - (entry.domainLookupStart ?? 0),
    tcpConnect:       (entry.connectEnd             ?? 0) - (entry.connectStart       ?? 0),
    requestDuration:  (entry.responseEnd            ?? 0) - (entry.requestStart       ?? 0),
    domContentLoaded: (entry.domContentLoadedEventEnd ?? 0) - fs,
    pageLoad:         (entry.loadEventEnd           ?? 0) - fs,
    redirectCount:    entry.redirectCount  ?? 0,
    navigationType:   entry.type          ?? 'navigate',
  };
}

/**
 * Extract First Paint and First Contentful Paint from PerformancePaintTiming entries.
 * @param {{ name: string, startTime: number }[]} entries
 * @returns {{ firstPaint: number|null, firstContentfulPaint: number|null }}
 */
export function parsePaintTiming(entries) {
  const result = { firstPaint: null, firstContentfulPaint: null };
  for (const e of (entries || [])) {
    if (e.name === 'first-paint')             result.firstPaint             = e.startTime;
    if (e.name === 'first-contentful-paint')  result.firstContentfulPaint   = e.startTime;
  }
  return result;
}

/**
 * Score a metric value against Core Web Vitals thresholds.
 * @param {string} name  Metric name (e.g. 'ttfb', 'fcp', 'lcp', 'cls')
 * @param {number} value
 * @returns {'good'|'needs-improvement'|'poor'|'unknown'}
 */
export function scoreMetric(name, value) {
  const t = WEB_VITALS_THRESHOLDS[name];
  if (!t) return 'unknown';
  if (value <= t.good) return 'good';
  if (value <= t.poor) return 'needs-improvement';
  return 'poor';
}

/**
 * Merge navigation timing and paint timing into one flat metrics object.
 * @param {object} navigation  Result of parseNavigationTiming()
 * @param {object} paint       Result of parsePaintTiming()
 * @returns {object}
 */
export function mergeMetrics(navigation, paint) {
  return {
    ...navigation,
    fp:  paint.firstPaint,
    fcp: paint.firstContentfulPaint,
  };
}

/**
 * Format a metrics object as a plain-text summary.
 * Known vitals are annotated with their score (good/needs-improvement/poor).
 * @param {object} metrics
 * @param {{ label?: string }} [opts]
 * @returns {string}
 */
export function formatMetrics(metrics, { label = 'Page Metrics' } = {}) {
  const lines = [`=== ${label} ===`];
  for (const [key, value] of Object.entries(metrics)) {
    if (value == null) continue;
    const score   = WEB_VITALS_THRESHOLDS[key] ? ` [${scoreMetric(key, value)}]` : '';
    const display = typeof value === 'number' ? `${value.toFixed(1)}` : String(value);
    lines.push(`  ${key}: ${display}${score}`);
  }
  return lines.join('\n');
}
