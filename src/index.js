import { loadConfig } from './config.js';
import { createServer } from './server.js';
import { DataStore } from './scraper/DataStore.js';

const config = loadConfig();

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

const server = createServer(config, { dataStore });

try {
  await server.listen({ host: config.server.host, port: config.server.port });
  console.log(`full-tool-browser listening on http://${config.server.host}:${config.server.port}`);
  if (dataStore) console.log('Scraper API aktif: /scraper/jobs, /scraper/analytics');
} catch (error) {
  server.log.error(error);
  process.exit(1);
}
