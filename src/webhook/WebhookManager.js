/**
 * WebhookManager — fire POST ke URL eksternal saat job selesai atau gagal.
 * Tidak throw — kegagalan webhook tidak boleh mengganggu job scraping.
 */
export class WebhookManager {
  /**
   * @param {string|null} url  — URL tujuan webhook
   * @param {object}      payload — body yang dikirim sebagai JSON
   */
  async fire(url, payload) {
    if (!url) return;
    try {
      const res = await fetch(url, {
        method:  'POST',
        headers: { 'Content-Type': 'application/json' },
        body:    JSON.stringify(payload),
        signal:  AbortSignal.timeout(10_000),
      });
      if (!res.ok) {
        console.warn(`[Webhook] POST ${url} → HTTP ${res.status}`);
      }
    } catch (err) {
      console.warn(`[Webhook] Gagal POST ${url}: ${err.message}`);
    }
  }
}
