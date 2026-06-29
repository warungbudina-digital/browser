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

const config = loadConfig();

const browser = new BrowserManager(config.browser);

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

let pool     = null;
let jobQueue = null;
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
    jobQueue = new JobQueue(config.redis, { pool, manager: browser, dataStore, sessionStore, mqttPublisher });
    console.log('[JobQueue] BullMQ worker aktif');
  }
}

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

const server = createServer(config, { browser, dataStore, sessionStore, scheduleStore, jobQueue, pool, scheduler });

try {
  await server.listen({ host: config.server.host, port: config.server.port });
  console.log(`full-tool-browser listening on http://${config.server.host}:${config.server.port}`);
  if (dataStore)    console.log('Scraper API aktif: /scraper/jobs, /scraper/analytics');
  if (jobQueue)     console.log(`Monitor dashboard: http://${config.server.host}:${config.server.port}/admin`);
  if (scheduler)    console.log('[Scheduler] Aktif — POST /schedules untuk buat jadwal baru');
  if (config.server.apiKey) console.log('[Auth] API key aktif — semua endpoint dilindungi Bearer token');
} catch (error) {
  server.log.error(error);
  process.exit(1);
}
