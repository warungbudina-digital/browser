// Pola error yang worth retrying (transient network failures)
const RETRYABLE = [
  /net::ERR_NAME_NOT_RESOLVED/,
  /net::ERR_INTERNET_DISCONNECTED/,
  /net::ERR_NETWORK_CHANGED/,
  /net::ERR_CONNECTION_REFUSED/,
  /net::ERR_CONNECTION_RESET/,
  /net::ERR_CONNECTION_TIMED_OUT/,
  /net::ERR_TIMED_OUT/,
  /TimeoutError/,
  /Navigation timeout/,
  /ETIMEDOUT/,
  /ECONNREFUSED/,
  /socket hang up/,
];

// Jangan retry — structural errors, bukan transient
const NOT_RETRYABLE = [
  /SSRF/i,
  /private.?network/i,
  /blocked/i,
  /net::ERR_TOO_MANY_REDIRECTS/,
  /net::ERR_CERT_/,
  /net::ERR_ABORTED/,
  /net::ERR_BLOCKED_BY/,
];

export function isRetryable(error) {
  const msg = error?.message ?? String(error);
  if (NOT_RETRYABLE.some((p) => p.test(msg))) return false;
  return RETRYABLE.some((p) => p.test(msg));
}

/**
 * Wrap async fn dengan exponential backoff.
 * Jitter ±25% mencegah thundering herd jika banyak profile berjalan bersamaan.
 */
export async function withRetry(fn, { maxAttempts = 3, baseDelayMs = 1500 } = {}) {
  let lastError;
  for (let attempt = 1; attempt <= maxAttempts; attempt++) {
    try {
      return await fn();
    } catch (error) {
      lastError = error;
      if (!isRetryable(error) || attempt === maxAttempts) throw error;
      const base = baseDelayMs * (2 ** (attempt - 1));
      const jitter = base * (0.75 + Math.random() * 0.5);
      await new Promise((r) => setTimeout(r, Math.floor(jitter)));
    }
  }
  throw lastError;
}
