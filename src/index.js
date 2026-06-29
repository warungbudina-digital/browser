import { loadConfig } from './config.js';
import { createServer } from './server.js';

const config = loadConfig();
const server = createServer(config);

try {
  await server.listen({ host: config.server.host, port: config.server.port });
  console.log(`full-tool-browser listening on http://${config.server.host}:${config.server.port}`);
} catch (error) {
  server.log.error(error);
  process.exit(1);
}
