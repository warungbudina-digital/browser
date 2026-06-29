import mqtt from 'mqtt';

/**
 * MqttPublisher — publish hasil scraping ke CHR MQTT broker (Mosquitto).
 * Koneksi auto-reconnect; publish non-blocking, error hanya di-warn.
 */
export class MqttPublisher {
  #client;
  #topicPrefix;
  #connected = false;

  constructor({ brokerUrl, username, password, topicPrefix = 'scraper/results', clientId }) {
    this.#topicPrefix = topicPrefix;

    this.#client = mqtt.connect(brokerUrl, {
      clientId:        clientId || ('browser-' + Math.random().toString(16).slice(2, 10)),
      username:        username  || undefined,
      password:        password  || undefined,
      clean:           true,
      reconnectPeriod: 5_000,
      connectTimeout:  10_000,
    });

    this.#client.on('connect',   () => { this.#connected = true;  console.log('[MQTT] Connected:', brokerUrl); });
    this.#client.on('reconnect', () => console.log('[MQTT] Reconnecting...'));
    this.#client.on('close',     () => { this.#connected = false; });
    this.#client.on('error',     (err) => console.warn('[MQTT] Error:', err.message));
  }

  get isConnected() { return this.#connected; }

  /**
   * Publish payload JSON ke topic `{prefix}/{jobId}`.
   * Non-blocking — tidak throw jika tidak terhubung.
   */
  async publish(jobId, payload) {
    if (!this.#connected) {
      console.warn(`[MQTT] Tidak terhubung, skip publish job ${jobId}`);
      return;
    }
    const topic = `${this.#topicPrefix}/${jobId}`;
    return new Promise((resolve) => {
      this.#client.publish(topic, JSON.stringify(payload), { qos: 1, retain: false }, (err) => {
        if (err) console.warn('[MQTT] Publish error:', err.message);
        else     console.log('[MQTT] Published →', topic);
        resolve();
      });
    });
  }

  /**
   * Publish payload JSON ke topic arbitrer (dipakai AlertManager untuk scraper/alerts/{platform}).
   */
  async publishRaw(topic, payload) {
    if (!this.#connected) {
      console.warn('[MQTT] Tidak terhubung, skip publishRaw →', topic);
      return;
    }
    return new Promise((resolve) => {
      this.#client.publish(topic, JSON.stringify(payload), { qos: 1, retain: false }, (err) => {
        if (err) console.warn('[MQTT] publishRaw error:', err.message);
        else     console.log('[MQTT] Published →', topic);
        resolve();
      });
    });
  }

  async close() {
    return new Promise((resolve) => this.#client.end(false, {}, resolve));
  }
}
