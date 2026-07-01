# Arsitektur `full-tool-browser`

Dokumen ini menjelaskan struktur kode, lapisan (layer), dan konvensi yang dipakai
repo ini. Untuk cara pakai/deploy lihat `README.md`.

## Gambaran besar

Service Node.js (Fastify) yang mengekspos browser automation (patchright/Playwright)
lewat HTTP, plus pipeline scraping sosial media (job queue, scheduler, analytics,
export) di atasnya.

```
HTTP client / AI agent / orchestrator (gRPC server di CHR — repo terpisah)
        │
        ▼
src/index.js          ← composition root: validasi config, buat semua service,
        │                wiring dependency, graceful shutdown
        ▼
src/server.js         ← createServer(): Fastify app = hooks middleware + route modules
        │
        ├── src/middleware/   ← cross-cutting hooks (urutan penting, lihat server.js)
        ├── src/routes/       ← endpoint HTTP per domain (tipis, hanya HTTP concerns)
        ├── src/views/        ← HTML statis (dashboard /admin)
        │
        ▼  (routes memanggil service layer)
src/browser/          ← inti browser automation
src/scraper/          ← domain scraping (platform, store, analytics, export)
src/queue/            ← BullMQ worker (butuh Redis)
src/scheduler/        ← cron schedule → submit scraper job
src/events/           ← EventBus + SSE
src/metrics/          ← Prometheus metrics + alerting
src/security/         ← SSRF policy, API key, rate limit, audit, workspace
src/mqtt/             ← publish hasil/alert ke broker MQTT
src/webhook/          ← callback webhook per job
```

## Layer dan tanggung jawabnya

### Composition root — `src/index.js`
Satu-satunya tempat service dibuat dan disambungkan. `BrowserManager`, store,
queue, scheduler, dll. dibuat di sini lalu di-inject ke `createServer()` lewat
options. **Jangan buat service di dalam `createServer()`** — `BrowserPool`
butuh instance `BrowserManager` yang sama sebelum server start
(lihat `.nudge/learned/browsermanager-must-be-created-in-index-js-*`).

Fitur bersifat opsional dan degradasi rapi: tanpa `DB_*` scraper API mati,
tanpa Redis job queue mati, dst. Route modules hanya diregister jika
dependensinya aktif (cek di `server.js`).

### HTTP layer — `src/server.js`, `src/routes/`, `src/middleware/`, `src/views/`
- `server.js` hanya menyusun: hooks middleware (urutan: correlationId → apiKey →
  audit → workspace → rateLimit) lalu route modules dengan context object berisi
  semua dependency.
- Setiap file di `src/routes/` meng-export `registerXxxRoutes(app, ctx)` dan
  memiliki schema zod-nya sendiri. Route handler hanya berisi HTTP concerns
  (parse/validasi, workspace qualify/unqualify, kode status) dan mendelegasikan
  ke service layer.
  - `browser.js` — `/browser/*` (capabilities, profiles, request dispatch)
  - `scraper.js` — `/scraper/*` (jobs, analytics, export)
  - `sessions.js` — `/sessions/*` (cookie session import/list/clear)
  - `tiktok.js` — `/tiktok/publish`
  - `schedules.js` — `/schedules/*`
  - `monitor.js` — `/health`, `/metrics`, `/monitor/*`
  - `admin.js` — `/admin/*` (audit, keys, workspaces, dashboard)
  - `events.js` — `/events*`, `/scraper/jobs/:id/stream` (SSE)
- `src/views/adminDashboard.js` — HTML dashboard sebagai satu template literal.
  Di dalam `<script>`-nya **jangan pakai nested backtick** (node --check gagal,
  lihat `.nudge/learned/nested-template-literals-*`). Hook Fastify harus `async`
  atau pakai bentuk 3-arg dengan `done()` (Fastify v5).

### Browser layer — `src/browser/`
- `BrowserManager.js` — lifecycle profile browser (managed lokal vs remote CDP),
  entry point `dispatch(action, payload)`.
- `BrowserService.js` — implementasi semua action per profile (snapshot, act,
  cookies, intercept, emulasi device/geo/network, dst.). File terbesar di repo;
  manager-manager kecil di folder yang sama (`HarRecorder`, `DeviceEmulator`, …)
  adalah unit yang dia komposisikan.
- Navigasi dan response selalu lewat SSRF policy (`src/security/ssrf.js`).

### Domain scraping — `src/scraper/`
- `ScraperService.js` — submit/list/delete job; daftar platform di
  `SUPPORTED_PLATFORMS`.
- `platforms/` — extractor per platform (instagram, tiktok, twitter) +
  `tiktokUpload.js` (publish flow).
- `DataStore` / `SessionStore` / `ScheduleStore` — persistence PostgreSQL
  (schema di `db/init.sql`).
- `Exporter.js`, `analytics.js` — query & serialisasi (csv/json/…).

### Infrastruktur pendukung
- `src/queue/JobQueue.js` — BullMQ worker; mengambil slot dari `BrowserPool`,
  restore session, jalankan platform extractor, simpan hasil, publish event.
- `src/scheduler/Scheduler.js` — node-cron; tiap jadwal men-submit job scraper.
- `src/events/` — `EventBus` (pub/sub in-process) + `SseManager` (koneksi SSE);
  timer keepalive wajib `.unref()`.
- `src/security/` — `KeyStore` (Bearer auth), `KeyRateLimiter`, `AuditLogger`
  (ring buffer), `WorkspaceContext` (multi-tenant prefix pada nama profile).
- `src/browser-server.js` — proxy CDP standalone (workaround patchright yang
  selalu bind CDP ke loopback).
- `src/cli.js` — entry CLI (`full-tool-browser`).

## Direktori non-kode

| Path | Isi |
|---|---|
| `test/` | Unit test `node:test`. `phaseNN.test.js` = test per fase pengembangan. |
| `db/init.sql` | Schema PostgreSQL (dipakai container postgres saat init). |
| `examples/` | Contoh pemakaian HTTP API (bash + kontrak JSON untuk agent). |
| `skill/` | Claude Code skills yang MEMAKAI service ini (bukan bagian runtime). |
| `wireguard/` | Setup tunnel ke CHR VPS (orchestrator gRPC hidup di repo terpisah). |
| `.nudge/learned/` | Catatan debugging durable — baca sebelum debugging ulang. |

## Konvensi & aturan penting

1. **Test**: `npm test` memakai glob `test/*.test.js` — shell meng-expand ke path
   eksplisit. Jangan jalankan `node --test` tanpa argumen file (hang, lihat
   `.nudge/learned/node-test-hangs-*`). Test tidak boleh meng-import modul yang
   berantai ke `patchright` (verifikasi keberadaan method via baca source).
2. **Lint**: `npm run lint` = `node --check` semua `src/**/*.js` via `find`;
   file baru otomatis tercakup.
3. **Dependency injection lewat parameter**, bukan singleton/import langsung —
   memudahkan test dan menjaga composition root tunggal. Ingat: private field
   (`#x`) tidak bisa di-patch dari luar setelah konstruksi.
4. **Docker**: stage `runtime` wajib `COPY package.json` (dibaca saat startup
   untuk versi di `/monitor/health`).
5. **Bahasa**: komentar/log/pesan error memakai Bahasa Indonesia, mengikuti
   kode yang sudah ada.
