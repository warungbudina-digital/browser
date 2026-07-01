# CHR's gRPC job orchestrator lives in a separate git repo on CHR, not in this one

## What went wrong

This repo (`full-tool-browser`) exposes `POST /scraper/jobs` /
`GET /scraper/jobs/:id`, and a comment in `.env.example` mentions a
"grpc-server" on the CHR VPS that calls it — but there is no gRPC code,
proto, or orchestrator source anywhere in this repository. Searching this
repo for "grpc" only turns up that one `.env.example` comment. The actual
orchestrator is a separate Go service living in its own git repo on the CHR
host (103.181.143.250), not checked into this repo at all — easy to waste
time grepping/exploring the wrong repository for it.

## Fix

The orchestrator source is at `/root/mikrotik-CHR/grpc-server/` on CHR
(`main.go`, `proto/orchestrator.proto`), part of the `mikrotik-CHR`
docker-compose project (`/root/mikrotik-CHR/docker-compose.yml`) alongside
`routeros` (MikroTik CHR), `router-proxy` (nginx, exposes the gRPC service on
port 50051 over WireGuard), `unbound`, `pihole`, `mosquitto`, and
`grpc-server` itself (container name `grpc-orchestrator`).

Contract summary (read `main.go` for the authoritative version):
- Proto `Orchestrator` service: `Ping`, `SubmitJob(platform, url,
  browser_profile)`, `GetJob`, `ListJobs`, `CancelJob`. `Platform` enum
  (`INSTAGRAM`/`TIKTOK`/`TWITTER`) matches this repo's `SCRAPERS` keys
  (lowercased) exactly — see `src/scraper/ScraperService.js`.
- On `SubmitJob`, the Go orchestrator calls `POST <BROWSER_URL>/scraper/jobs`
  with `{platform, targetUrl, profileName}`, expects `{ok:true, job:{id}}`.
- Polls `GET /scraper/jobs/:id` every 5s (up to 5 min) reading
  `job.status`/`job.error` from the top level of the response.
- On completion, republishes the full poll response to MQTT topic
  `scraper/results/<grpc-job-id>` — a DIFFERENT id namespace than this
  repo's own internal job id, which ALSO independently publishes to
  `scraper/results/<our-job-id>` via `MqttPublisher` on job completion. Two
  separate, non-colliding topics for the same logical job — known
  duplication, not a bug.
- Auth: sends `Authorization: Bearer <BROWSER_API_KEY>` (CHR's
  `docker-compose.yml` env var) — must match this repo's `.env` `API_KEY`
  for requests to be accepted once auth is enabled here (empty `API_KEY` =
  auth disabled entirely, see `src/middleware/apiKey.js`).

## Verification

```bash
# On CHR, inspect the live contract instead of guessing:
ssh <user>@<chr-host> "sudo cat /root/mikrotik-CHR/grpc-server/main.go"
ssh <user>@<chr-host> "sudo cat /root/mikrotik-CHR/grpc-server/proto/orchestrator.proto"
ssh <user>@<chr-host> "sudo cat /root/mikrotik-CHR/docker-compose.yml"

# Confirm the running container's actual env (BROWSER_URL, BROWSER_API_KEY, etc.):
ssh <user>@<chr-host> "sudo docker inspect grpc-orchestrator --format '{{.Config.Env}}'"
```
