# Mosquitto MQTT DNAT on CHR only matches 127.0.0.1 — WireGuard clients blocked

## What went wrong

Mosquitto docker-compose bound to `127.0.0.1:1883:1883` (loopback only).
The existing iptables DNAT rule in docker-compose.yml was:
```
DNAT  tcp  0.0.0.0/0  127.0.0.1  tcp dpt:1883  to:172.20.0.7:1883
```
The second `127.0.0.1` is the **destination** match — only traffic originally
destined for `127.0.0.1:1883` gets redirected. WireGuard clients connecting to
`10.10.0.1:1883` have destination `10.10.0.1`, not `127.0.0.1`, so they never
hit the DNAT rule → connection refused.

## Fix

Add a separate DNAT rule scoped to the WireGuard interface:
```bash
iptables -t nat -A PREROUTING -i wg0 -p tcp --dport 1883 -j DNAT \
  --to-destination 172.20.0.7:1883
iptables -t nat -A PREROUTING -i wg0 -p tcp --dport 9001 -j DNAT \
  --to-destination 172.20.0.7:9001
```

Persist in `/etc/wireguard/wg0.conf` PostUp/PostDown sections.
Also requires the MASQUERADE + DOCKER-USER rules from the DNS fix
(see: [[wireguard-docker-dns-routing-needs-masquerade-docker-user-rules-beyond-dnat]])
or Mosquitto won't be able to route replies back to the WireGuard client.

## Verification

```bash
# From scraper VPS:
timeout 3 bash -c "echo >/dev/tcp/10.10.0.1/1883" && echo "MQTT OPEN"

# Check broker receives connection (from CHR):
docker logs mosquitto --tail=5
```
