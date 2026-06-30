'use strict';
/**
 * CDP proxy for the browser-runner service.
 *
 * Spawns patchright Chromium bound to 127.0.0.1:CHROME_PORT (the OS never
 * lets --remote-debugging-address=0.0.0.0 override this in patched builds),
 * then exposes a plain HTTP+WS proxy on 0.0.0.0:LISTEN_PORT.
 *
 * JSON responses from /json/* are rewritten so every
 * "ws://127.0.0.1:CHROME_PORT/..." URL becomes
 * "ws://<caller's Host header>/..." — this lets patchright's
 * connectOverCDP() receive WebSocket URLs it can actually reach.
 */
const { spawn }    = require('child_process');
const http         = require('http');
const net          = require('net');
const { execSync } = require('child_process');

const CHROME_PORT    = 9223;
const LISTEN_PORT    = 9222;
const BROWSERS_PATH  = process.env.PLAYWRIGHT_BROWSERS_PATH || '/ms-playwright';

function findChrome() {
  const p = execSync(`find ${BROWSERS_PATH} -name chrome -type f | head -1`)
    .toString().trim();
  if (!p) throw new Error(`Chrome binary not found under ${BROWSERS_PATH}`);
  return p;
}

function waitForChrome(maxMs = 30_000) {
  const deadline = Date.now() + maxMs;
  return new Promise((resolve, reject) => {
    function check() {
      if (Date.now() > deadline) return reject(new Error('Chrome did not respond within 30 s'));
      const req = http.get(`http://127.0.0.1:${CHROME_PORT}/json/version`, (res) => {
        res.resume();
        if (res.statusCode === 200) return resolve();
        setTimeout(check, 500);
      });
      req.on('error', () => setTimeout(check, 500));
      req.end();
    }
    setTimeout(check, 1000);
  });
}

(async () => {
  const chromePath = findChrome();
  console.log(`[browser-server] Starting: ${chromePath}`);

  const chrome = spawn(chromePath, [
    '--no-sandbox',
    '--disable-gpu',
    '--disable-dev-shm-usage',
    '--disable-setuid-sandbox',
    '--headless=new',
    `--remote-debugging-port=${CHROME_PORT}`,
    '--user-data-dir=/tmp/chrome-data',
  ], { stdio: 'inherit' });

  chrome.on('exit', (code, signal) => {
    console.error(`[browser-server] Chrome exited code=${code} signal=${signal}`);
    process.exit(typeof code === 'number' ? code : 1);
  });

  await waitForChrome();
  console.log(`[browser-server] Chrome ready on 127.0.0.1:${CHROME_PORT}`);

  function rewriteUrls(body, externalHost) {
    return body.replace(
      new RegExp(`ws://127\\.0\\.0\\.1:${CHROME_PORT}/`, 'g'),
      `ws://${externalHost}/`
    );
  }

  const server = http.createServer((req, res) => {
    const externalHost = req.headers.host || `localhost:${LISTEN_PORT}`;
    const opts = {
      hostname: '127.0.0.1',
      port: CHROME_PORT,
      path: req.url,
      method: req.method,
      headers: { ...req.headers, host: `127.0.0.1:${CHROME_PORT}` },
    };

    const proxy = http.request(opts, (proxyRes) => {
      const ct = proxyRes.headers['content-type'] || '';
      if (ct.includes('application/json')) {
        let body = '';
        proxyRes.on('data', (c) => { body += c; });
        proxyRes.on('end', () => {
          const out = rewriteUrls(body, externalHost);
          res.writeHead(proxyRes.statusCode, {
            ...proxyRes.headers,
            'content-length': Buffer.byteLength(out),
          });
          res.end(out);
        });
      } else {
        res.writeHead(proxyRes.statusCode, proxyRes.headers);
        proxyRes.pipe(res);
      }
    });

    proxy.on('error', (err) => {
      if (!res.headersSent) { res.writeHead(502); res.end(String(err)); }
    });
    req.pipe(proxy);
  });

  server.on('upgrade', (req, socket, head) => {
    const conn = net.connect(CHROME_PORT, '127.0.0.1');
    conn.on('connect', () => {
      const raw =
        `${req.method} ${req.url} HTTP/1.1\r\n` +
        `Host: 127.0.0.1:${CHROME_PORT}\r\n` +
        Object.entries(req.headers)
          .filter(([k]) => k.toLowerCase() !== 'host')
          .map(([k, v]) => `${k}: ${v}`)
          .join('\r\n') +
        '\r\n\r\n';
      conn.write(raw);
      if (head && head.length) conn.write(head);
      conn.pipe(socket);
      socket.pipe(conn);
    });
    conn.on('error', () => socket.destroy());
    socket.on('error', () => conn.destroy());
  });

  server.listen(LISTEN_PORT, '0.0.0.0', () => {
    console.log(`[browser-server] CDP proxy listening on 0.0.0.0:${LISTEN_PORT}`);
  });

  function shutdown() { chrome.kill('SIGTERM'); server.close(() => process.exit(0)); }
  process.on('SIGTERM', shutdown);
  process.on('SIGINT', shutdown);
})();
