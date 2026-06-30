# Unbound image healthcheck uses port 53 but service listens on 5335

## What went wrong
`mvance/unbound` image has a built-in healthcheck:
```
drill @127.0.0.1 cloudflare.com || exit 1
```
`drill` without `-p` defaults to port 53. But `unbound.conf` sets `port: 5335`.
Healthcheck always fails → container stays `unhealthy` even though DNS works fine.

Confirmed DNS works:
```bash
dig @172.20.0.5 -p 5335 google.com   # returns NOERROR with answers
```

## Fix
Override the healthcheck in `docker-compose.yml` under the unbound service:
```yaml
healthcheck:
  test: ["CMD-SHELL", "drill @127.0.0.1 -p 5335 cloudflare.com || exit 1"]
  interval: 30s
  timeout: 10s
  start_period: 15s
  retries: 3
```

## Verification
```bash
docker ps --format '{{.Names}}\t{{.Status}}' | grep unbound
# Should show: unbound   Up X seconds (healthy)
```
