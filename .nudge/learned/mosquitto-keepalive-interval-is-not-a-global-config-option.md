# Mosquitto keepalive_interval is not a global config option

## What went wrong
`mosquitto/mosquitto.conf` (CHR VPS) had `keepalive_interval 60` as a top-level option.
Mosquitto 2.x treats this as a bridge-only directive and crashes on startup:

```
Error: The 'keepalive_interval' option requires a bridge to be defined first.
Error found at /mosquitto/config/mosquitto.conf:39.
mosquitto version 2.1.2 terminating
```
Container enters a crash loop.

## Fix
Remove the `keepalive_interval` line entirely. It is only valid inside a
`connection <name>` bridge block. Client keepalive is negotiated per-client
via the MQTT CONNECT packet — it does not need a broker-side override.

```bash
sed -i '/^# Keepalive/d; /^keepalive_interval/d' mosquitto/mosquitto.conf
docker restart mosquitto
```

## Verification
```bash
docker logs mosquitto 2>&1 | grep -E 'running|error'
# Should show: mosquitto version 2.x.x running
```
