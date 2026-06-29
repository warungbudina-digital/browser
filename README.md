# full-tool-browser

Versi **lebih mirip OpenClaw browser tool** tapi berdiri sendiri, supaya bisa kamu deploy di VPS lain dan dipakai manual atau oleh AI model lain langsung lewat HTTP.

## Yang baru di v0.2

Sekarang repo ini sudah punya:

- **SSRF policy layer** untuk navigation + remote CDP
- **profile manager** dengan profile aktif, create/update/remove/select
- **managed profile** dan **remote CDP profile**
- **OpenClaw-like single request surface**: `POST /browser/request`
- **agent-facing discovery endpoint**: `GET /browser/capabilities`
- **profile API**: `GET/POST /browser/profiles`
- kontrak JSON contoh untuk AI agent: `examples/agent-contract.json`

---

## Tujuan desain

Supaya AI/tooling lain bisa menggunakannya seperti ini:

1. cek capability
2. start browser profile
3. open / navigate URL
4. snapshot → dapat ref
5. act pakai ref
6. ambil screenshot / pdf / console / requests

Persis pola core workflow browser OpenClaw, tapi tanpa seluruh gateway OpenClaw.

---

## Arsitektur

```text
full-tool-browser/
├── Dockerfile
├── docker-compose.yml
├── README.md
├── examples/
│   ├── agent-contract.json
│   └── manual-flow.sh
├── src/
│   ├── index.js
│   ├── cli.js
│   ├── config.js
│   ├── server.js
│   ├── browser/
│   │   ├── BrowserManager.js
│   │   ├── BrowserService.js
│   │   ├── ProfileStore.js
│   │   ├── RefStore.js
│   │   └── snapshot.js
│   └── security/
│       └── ssrf.js
└── test/
    ├── profile-store.test.js
    ├── ref-store.test.js
    ├── snapshot.test.js
    └── ssrf.test.js
```

---

## Mapping OpenClaw → repo ini

### Browser tool abstraction

| OpenClaw | Repo ini |
| --- | --- |
| `browser` tool tunggal | `POST /browser/request` |
| browser profiles | `/browser/profiles` |
| browser capability discovery | `/browser/capabilities` |
| managed browser profile | profile `driver: "managed"` |
| remote CDP profile | profile `driver: "remote-cdp"` |

### Security behavior

| OpenClaw-ish concept | Repo ini |
| --- | --- |
| navigation SSRF guard | `src/security/ssrf.js` |
| remote CDP SSRF guard | `assertCdpEndpointAllowed()` |
| allow exact hostname | `allowedHostnames` |
| wildcard allowlist | `hostnameAllowlist` |
| allow private network | `dangerouslyAllowPrivateNetwork: true` |
| strict mode default | aktif by default |

### Snapshot/ref workflow

| OpenClaw | Repo ini |
| --- | --- |
| numeric refs | `1`, `2`, `3` |
| interactive refs | `e1`, `e2`, `e3` |
| ref cache | `RefStore` per targetId |
| act by ref | `request.kind` + `ref` |

---

## HTTP API utama

### 1) Capability discovery

```bash
curl http://127.0.0.1:8080/browser/capabilities
```

Ini penting untuk AI model lain, karena mereka bisa baca:

- action apa saja yang tersedia
- act kind apa yang tersedia
- endpoint mana yang dipakai
- profile action apa yang didukung
- policy SSRF aktif seperti apa

---

### 2) Browser request

```bash
curl -X POST http://127.0.0.1:8080/browser/request \
  -H 'content-type: application/json' \
  -d '{"action":"start"}'
```

Field umum:

```json
{
  "action": "open|navigate|snapshot|act|...",
  "profile": "openclaw",
  "targetId": "optional-tab-id"
}
```

Action yang didukung:

- `status`
- `start`
- `stop`
- `tabs`
- `open`
- `navigate`
- `focus`
- `close`
- `snapshot`
- `screenshot`
- `pdf`
- `console`
- `errors`
- `requests`
- `dialog`
- `act`

---

### 3) Profile API

List profile:

```bash
curl http://127.0.0.1:8080/browser/profiles
```

Create managed profile:

```bash
curl -X POST http://127.0.0.1:8080/browser/profiles \
  -H 'content-type: application/json' \
  -d '{
    "action": "create",
    "profile": {
      "name": "work",
      "driver": "managed",
      "headless": true,
      "profileDir": "/app/profiles/work"
    }
  }'
```

Create remote CDP profile:

```bash
curl -X POST http://127.0.0.1:8080/browser/profiles \
  -H 'content-type: application/json' \
  -d '{
    "action": "create",
    "profile": {
      "name": "remote",
      "driver": "remote-cdp",
      "cdpUrl": "http://10.0.0.42:9222"
    }
  }'
```

Select active profile:

```bash
curl -X POST http://127.0.0.1:8080/browser/profiles \
  -H 'content-type: application/json' \
  -d '{"action":"select","name":"remote"}'
```

---

## Act contract

Payload `action=act`:

```json
{
  "action": "act",
  "profile": "openclaw",
  "request": {
    "kind": "click",
    "ref": "e1"
  }
}
```

Supported `kind`:

- `click`
- `type`
- `press`
- `hover`
- `scrollIntoView`
- `drag`
- `select`
- `fill`
- `resize`
- `wait`
- `evaluate`
- `close`
- `batch`

---

## SSRF policy

Default repo ini **fail-closed** untuk target private network.

### Default behavior

- navigation ke private IP akan diblok
- remote CDP ke private IP/hostname private akan diblok
- hostname non-IP akan dibatasi kalau strict mode aktif dan belum di-allowlist
- jika proxy env aktif dan policy strict tidak mengizinkan private network, request diblok

### Env variables

| Variable | Fungsi |
| --- | --- |
| `BROWSER_SSRF_DANGEROUSLY_ALLOW_PRIVATE_NETWORK` | izinkan private network |
| `BROWSER_SSRF_ALLOWED_HOSTNAMES` | exact hostnames, comma-separated |
| `BROWSER_SSRF_HOSTNAME_ALLOWLIST` | wildcard allowlist, comma-separated |

Contoh:

```bash
export BROWSER_SSRF_ALLOWED_HOSTNAMES=docs.openai.com,example.com
export BROWSER_SSRF_HOSTNAME_ALLOWLIST=*.example.org
```

Kalau memang butuh akses private network internal:

```bash
export BROWSER_SSRF_DANGEROUSLY_ALLOW_PRIVATE_NETWORK=true
```

---

## Mode profile

### Managed

Playwright launch persistent context sendiri.

Cocok buat:

- browser otomatis terisolasi
- workflow mirip profile `openclaw`
- artifact generation stabil

### Remote CDP

Attach ke browser lain via CDP.

Cocok buat:

- VPS yang browsernya dipisah
- browserless / remote Chrome
- mesin lain yang expose CDP

---

## Jalankan lokal

```bash
cd full-tool-browser
npm install
npm run start
```

Health:

```bash
curl http://127.0.0.1:8080/health
```

Capabilities:

```bash
curl http://127.0.0.1:8080/browser/capabilities
```

---

## Jalankan Docker

```bash
cd full-tool-browser
docker compose up --build
```

Persist data:

- `./data/profiles`
- `./data/artifacts`
- `./data/state`

---

## CLI

```bash
full-tool-browser capabilities
full-tool-browser profiles
full-tool-browser profile-select openclaw
full-tool-browser start --profile openclaw
full-tool-browser open https://example.com --profile openclaw
full-tool-browser snapshot --interactive --profile openclaw
full-tool-browser act --profile openclaw --json '{"kind":"click","ref":"e1"}'
```

Create remote profile via CLI:

```bash
full-tool-browser profile-create --json '{
  "name": "remote",
  "driver": "remote-cdp",
  "cdpUrl": "http://10.0.0.42:9222"
}'
```



## Upload / Download / Trace

### Upload file

```bash
full-tool-browser upload --profile openclaw --selector "input[type=file]" --paths /tmp/a.pdf,/tmp/b.png
```

HTTP:

```bash
curl -X POST http://127.0.0.1:8080/browser/request \
  -H 'content-type: application/json' \
  -d '{"action":"upload","profile":"openclaw","selector":"input[type=file]","paths":["/tmp/a.pdf","/tmp/b.png"]}'
```

### Download file

```bash
full-tool-browser download --profile openclaw --ref e12 --path ./artifacts/report.pdf
```

HTTP:

```bash
curl -X POST http://127.0.0.1:8080/browser/request \
  -H 'content-type: application/json' \
  -d '{"action":"download","profile":"openclaw","ref":"e12","path":"./artifacts/report.pdf"}'
```

### Trace start/stop

```bash
full-tool-browser trace-start --profile openclaw --title "checkout-debug"
full-tool-browser trace-stop --profile openclaw --path ./artifacts/checkout-trace.zip
```

HTTP:

```bash
curl -X POST http://127.0.0.1:8080/browser/request \
  -H 'content-type: application/json' \
  -d '{"action":"trace","traceAction":"start","profile":"openclaw","title":"checkout-debug"}'

curl -X POST http://127.0.0.1:8080/browser/request \
  -H 'content-type: application/json' \
  -d '{"action":"trace","traceAction":"stop","profile":"openclaw","path":"./artifacts/checkout-trace.zip"}'
```

---

## Workflow yang direkomendasikan untuk AI model lain

1. `GET /browser/capabilities`
2. `GET /browser/profiles`
3. kalau perlu, `POST /browser/profiles` untuk create/select profile
4. `POST /browser/request {"action":"start"}`
5. `POST /browser/request {"action":"open","url":"..."}`
6. `POST /browser/request {"action":"snapshot","interactive":true}`
7. gunakan `ref` dari snapshot untuk `act`
8. setelah navigasi besar, **ulang snapshot**

Lihat juga:

- `examples/manual-flow.sh`
- `examples/agent-contract.json`

---

## Catatan penting

Ini masih bukan clone 100% OpenClaw. Yang sudah ditiru terutama:

- core browser request contract
- managed vs remote profile split
- SSRF-style safety guard
- snapshot → ref → act workflow
- profile state persistence

Yang belum:

- existing-session / Chrome MCP mode
- frame-scoped refs
- full ARIA snapshot parity
- browser sandbox container orchestration
- auth / multi-tenant gateway layer

---

## Test

```bash
npm run lint
npm test
```
