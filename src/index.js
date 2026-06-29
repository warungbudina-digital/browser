import { loadConfig } from './config.js';
import { createServer } from './server.js';
import { BrowserManager } from './browser/BrowserManager.js';
import { BrowserPool } from './browser/BrowserPool.js';
import { DataStore } from './scraper/DataStore.js';
import { JobQueue } from './queue/JobQueue.js';

const config = loadConfig();

// BrowserManager dibuat di luar createServer agar bisa dibagi ke BrowserPool
const browser = new BrowserManager(config.browser);

let dataStore = null;
if (config.db) {
  dataStore = new DataStore(config.db);
  try {
    await dataStore.init();
    console.log('[DataStore] PostgreSQL schema ready');
  } catch (err) {
    console.error('[DataStore] Gagal init DB, scraper API dinonaktifkan:', err.message);
    dataStore = null;
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
    jobQueue = new JobQueue(config.redis, { pool, manager: browser, dataStore });
    console.log('[JobQueue] BullMQ worker aktif');
  }
}

const server = createServer(config, { browser, dataStore, jobQueue, pool });

try {
  await server.listen({ host: config.server.host, port: config.server.port });
  console.log(`full-tool-browser listening on http://${config.server.host}:${config.server.port}`);
  if (dataStore) console.log('Scraper API aktif: /scraper/jobs, /scraper/analytics');
  if (jobQueue) console.log(`Monitor dashboard: http://${config.server.host}:${config.server.port}/admin`);
} catch (error) {
  server.log.error(error);
  process.exit(1);
}
