import { loadConfig } from './config.js';
import { createServer } from './server.js';
import { BrowserManager } from './browser/BrowserManager.js';
import { BrowserPool } from './browser/BrowserPool.js';
import { DataStore } from './scraper/DataStore.js';
import { SessionStore } from './scraper/SessionStore.js';
import { JobQueue } from './queue/JobQueue.js';
import { MqttPublisher } from './mqtt/MqttPublisher.js';
import { ScheduleStore } from './scraper/ScheduleStore.js';
import { Scheduler } from './scheduler/Scheduler.js';
import { createMetrics } from './metrics/MetricsCollector.js';
import { AlertManager } from './metrics/AlertManager.js';
import { KeyStore } from './security/KeyStore.js';
import { AuditLogger } from './security/AuditLogger.js';
import { KeyRateLimiter } from './security/KeyRateLimiter.js';

const config = loadConfig();

// ── Phase 9: Auth, Audit, Rate Limit ─────────────────────────────────────────
const keyStore = new KeyStore({
  key:  config.server.apiKey,
  keys: config.server.apiKeys,
});

const auditLogger = config.auditLog.enabled ? new AuditLogger({ maxSize: config.auditLog.maxSize }) : null;

const rateLimiter = config.rateLimit.enabled
  ? new KeyRateLimiter({ rpm: config.rateLimit.rpm, rph: config.rateLimit.rph })
  : null;

if (auditLogger) console.log(`[AuditLogger] Aktif — ring buffer ${config.auditLog.maxSize} entries`);
if (rateLimiter) console.log(`[RateLimiter] Aktif — ${config.rateLimit.rpm} RPM / ${config.rateLimit.rph} RPH per key`);
if (!keyStore.isEmpty()) console.log(`[KeyStore] ${keyStore.names().length} key(s): ${keyStore.names().join(', ')}`);

const browser = new BrowserManager(config.browser);

// Metrics — aktif selalu (tidak perlu Redis/DB)
const metrics = createMetrics();

let dataStore     = null;
let sessionStore  = null;
let scheduleStore = null;
if (config.db) {
  dataStore = new DataStore(config.db);
  try {
    await dataStore.init();
    sessionStore  = new SessionStore(dataStore.pool);
    scheduleStore = new ScheduleStore(dataStore.pool);
    console.log('[DataStore] PostgreSQL schema ready');
  } catch (err) {
    console.error('[DataStore] Gagal init DB, scraper API dinonaktifkan:', err.message);
    dataStore     = null;
    sessionStore  = null;
    scheduleStore = null;
  }
}

let pool         = null;
let jobQueue     = null;
let alertManager = null;
if (config.redis && dataStore) {
  pool = new BrowserPool(browser, { size: config.pool.size, profilePrefix: config.pool.profilePrefix });
  try {
    await pool.init();
    console.log(`[BrowserPool] ${config.pool.size} slot siap (${config.pool.profilePrefix}-1..${config.pool.size})`);
  } catch (err) {
    console.error('[BrowserPool] Gagal init pool:', err.message);
    pool = null;
  }

  if (pool) {
    let mqttPublisher = null;
    if (config.mqtt) {
      mqttPublisher = new MqttPublisher(config.mqtt);
      console.log('[MQTT] Publisher inisialisasi →', config.mqtt.brokerUrl);
    }
    // AlertManager dibuat setelah mqttPublisher tersedia agar bisa publish alert
    alertManager = new AlertManager(config.alerting, { mqttPublisher });
    jobQueue = new JobQueue(config.redis, { pool, manager: browser, dataStore, sessionStore, mqttPublisher, metrics, alertManager });
    console.log('[JobQueue] BullMQ worker aktif');
  }
}

// Jika tidak ada pool/Redis, tetap buat alertManager (tanpa MQTT, untuk endpoint /monitor/metrics)
if (!alertManager) alertManager = new AlertManager(config.alerting);

// Scheduler — inisialisasi setelah scraper tersedia
let scheduler = null;
if (scheduleStore && dataStore) {
  // ScraperService dibuat ulang sementara hanya untuk scheduler
  // (server.js akan membuat instance sendiri yang dibagi via createServer)
  const { ScraperService } = await import('./scraper/ScraperService.js');
  const scraperForScheduler = new ScraperService(browser, dataStore, jobQueue);
  scheduler = new Scheduler(scheduleStore, scraperForScheduler);
  await scheduler.start();
}

const server = createServer(config, { browser, dataStore, sessionStore, scheduleStore, jobQueue, pool, scheduler, metrics, alertManager, keyStore, auditLogger, rateLimiter });

try {
  await server.listen({ host: config.server.host, port: config.server.port });
  console.log(`full-tool-browser listening on http://${config.server.host}:${config.server.port}`);
  if (dataStore)    console.log('Scraper API aktif: /scraper/jobs, /scraper/analytics');
  if (jobQueue)     console.log(`Monitor dashboard: http://${config.server.host}:${config.server.port}/admin`);
  if (scheduler)    console.log('[Scheduler] Aktif — POST /schedules untuk buat jadwal baru');
  console.log(`[Metrics] Prometheus endpoint: http://${config.server.host}:${config.server.port}/metrics`);
  if (!keyStore.isEmpty()) console.log('[Auth] API key aktif — semua endpoint dilindungi Bearer token');
  if (rateLimiter) console.log(`[RateLimiter] ${config.rateLimit.rpm} RPM / ${config.rateLimit.rph} RPH per key`);
  if (auditLogger) console.log(`[AuditLogger] GET /admin/audit, GET /admin/audit/stats tersedia`);
} catch (error) {
  server.log.error(error);
  process.exit(1);
}
