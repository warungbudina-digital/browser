# mvance/unbound image does not include root.hints or root.key

## What went wrong
`unbound/unbound.conf` referenced:
```
root-hints: "/opt/unbound/etc/unbound/root.hints"
auto-trust-anchor-file: "/opt/unbound/etc/unbound/root.key"
```
The `mvance/unbound:latest` image does not bundle these files — only
`a-records.conf`, `forward-records.conf`, `srv-records.conf`, and
`unbound.conf.example` exist under `/opt/unbound/etc/unbound/`.
Container exits with code 1 and no logs.

`unbound-checkconf` reveals the real error:
```
/opt/unbound/etc/unbound/root.hints: No such file or directory
fatal error: file with root-hints does not exist in chrootdir
```

## Fix
1. Download root.hints to the host and mount it:
```bash
curl -o unbound/root.hints https://www.internic.net/domain/named.cache
```
Add to docker-compose.yml volumes:
```yaml
- ./unbound/root.hints:/opt/unbound/etc/unbound/root.hints:ro
```
2. Remove `auto-trust-anchor-file` line from unbound.conf (root.key not in image).

## Verification
```bash
docker run --rm --entrypoint sh \
  -v ./unbound/unbound.conf:/opt/unbound/etc/unbound/unbound.conf:ro \
  -v ./unbound/root.hints:/opt/unbound/etc/unbound/root.hints:ro \
  mvance/unbound:latest \
  -c 'unbound-checkconf /opt/unbound/etc/unbound/unbound.conf'
# Should print: unbound-checkconf: no errors in ...
```
