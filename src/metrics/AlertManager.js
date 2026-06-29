import { WebhookManager } from '../webhook/WebhookManager.js';

/**
 * AlertManager — deteksi consecutive failures per platform.
 * Kirim alert ke webhook dan/atau MQTT saat threshold terlampaui.
 * Cooldown mencegah alert spam selama platform masih gagal terus-menerus.
 */
export class AlertManager {
  #threshold;
  #cooldownMs;
  #alertWebhookUrl;

  #failures  = new Map(); // platform → consecutive failure count
  #lastAlert = new Map(); // platform → timestamp of last alert fired

  #webhook;
  #mqtt;      // MqttPublisher | null
  #eventBus;  // EventBus | null

  constructor(
    { consecutiveFailureThreshold = 3, cooldownMs = 5 * 60_000, webhookUrl = null } = {},
    { mqttPublisher = null, eventBus = null } = {}
  ) {
    this.#threshold       = consecutiveFailureThreshold;
    this.#cooldownMs      = cooldownMs;
    this.#alertWebhookUrl = webhookUrl;
    this.#webhook         = new WebhookManager();
    this.#mqtt            = mqttPublisher;
    this.#eventBus        = eventBus;
  }

  /** Panggil saat job berhasil — reset counter platform. */
  recordSuccess(platform) {
    this.#failures.set(platform, 0);
  }

  /** Panggil saat job final-fail — increment counter, fire alert jika perlu. */
  async recordFailure(platform, { jobId, error } = {}) {
    const count = (this.#failures.get(platform) ?? 0) + 1;
    this.#failures.set(platform, count);

    if (count < this.#threshold) return;

    const now = Date.now();
    if (now - (this.#lastAlert.get(platform) ?? 0) < this.#cooldownMs) return;

    this.#lastAlert.set(platform, now);
    await this.#fireAlert(platform, count, { jobId, error });
  }

  async #fireAlert(platform, consecutiveFailures, { jobId, error }) {
    const payload = {
      type:               'scraper_alert',
      platform,
      consecutiveFailures,
      alertThreshold:     this.#threshold,
      jobId:              jobId ?? null,
      error:              error ?? null,
      timestamp:          Date.now(),
    };

    console.warn(
      '[AlertManager] ALERT: ' + platform +
      ' gagal ' + consecutiveFailures + 'x berturut-turut' +
      (jobId ? ' (job: ' + jobId + ')' : '')
    );

    this.#eventBus?.publish('alert.fired', {
      platform,
      consecutiveFailures,
      alertThreshold: this.#threshold,
      jobId:          jobId ?? null,
      error:          error ?? null,
      ts:             Date.now(),
    });

    await Promise.all([
      this.#alertWebhookUrl
        ? this.#webhook.fire(this.#alertWebhookUrl, payload)
        : Promise.resolve(),
      this.#mqtt
        ? this.#mqtt.publishRaw('scraper/alerts/' + platform, payload)
        : Promise.resolve(),
    ]);
  }

  status() {
    const out = {};
    for (const [platform, count] of this.#failures) {
      out[platform] = {
        consecutiveFailures: count,
        alertThreshold:      this.#threshold,
        alerting:            count >= this.#threshold,
      };
    }
    return out;
  }
}
