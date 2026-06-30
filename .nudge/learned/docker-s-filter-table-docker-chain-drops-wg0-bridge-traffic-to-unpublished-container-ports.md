# Docker's filter-table DOCKER chain drops wg0->bridge traffic to unpublished container ports

## What went wrong

WireGuard tunnel between scraper VPS and CHR was up (handshake OK, ping OK),
and the documented DNAT rules for DNS (port 53 -> PiHole) and MQTT (port
1883/9001 -> Mosquitto) existed in the nat table and were even being matched
(confirmed via `nft list table ip nat` — see the related nftables-counter
note). But DNS still timed out and MQTT got `connection refused`.

Root cause, found via `sudo nft list table ip filter`: Docker auto-generates
a catch-all rule in its own `DOCKER` chain:
```
iifname != "br-xxxxxxxxxxxx" oifname "br-xxxxxxxxxxxx" drop
```
This drops ALL forwarded traffic entering a Docker bridge network from any
non-bridge interface (including `wg0`) unless it matches one of the specific
`ip daddr <container-ip> ... tcp dport <published-port> accept` rules Docker
generates from `docker-compose.yml` `ports:` mappings. PiHole only `expose`s
port 53 (no `ports:` mapping), so DNS traffic always hit the catch-all drop.
Mosquitto's `ports:` mapping was `127.0.0.1:1883:1883`, so even though a
filter ACCEPT rule existed for `daddr 172.20.0.7 tcp dport 1883`, the
corresponding *nat* DNAT rule was scoped to `daddr 127.0.0.1` only — wg0
client traffic targets `10.10.0.1` (the tunnel IP), never matched that DNAT,
so it never even reached the filter table check; it just got delivered to
the CHR host's own local TCP stack and refused (see related "Mosquitto MQTT
DNAT only matches 127.0.0.1" note for that half of the fix).

Note: an earlier learned note attributed this drop to
`DOCKER-ISOLATION-STAGE-2`. Direct `nft` inspection in this session showed
that chain does NOT actually drop wg0->bridge forwarding here — the real
drop is the per-port catch-all at the end of the `DOCKER` chain (reached via
`DOCKER-FORWARD` -> `DOCKER-BRIDGE` -> `DOCKER`). The fix (DOCKER-USER
bypass) happens to work regardless of which exact chain is responsible,
since DOCKER-USER is evaluated first and short-circuits everything after it.

## Fix

Insert ACCEPT rules in `DOCKER-USER` (evaluated *before* Docker's own
`DOCKER-FORWARD`/`DOCKER` chains) for the WireGuard interface <-> the
relevant Docker bridge, in both directions:

```bash
BR=$(docker network inspect mikrotik-net --format '{{.Id}}' | cut -c1-12)
BR="br-$BR"
iptables -I DOCKER-USER 1 -i wg0 -o "$BR" -j ACCEPT
iptables -I DOCKER-USER 2 -i "$BR" -o wg0 -j ACCEPT
```

**Critical**: a previous session applied this fix live (via plain `iptables
-A`/`-I`) but never added it to `/etc/wireguard/wg0.conf`'s `PostUp`/
`PostDown`. When the WireGuard interface was later torn down and rebuilt
(`wg-quick down wg0 && wg-quick up wg0`), the live-only rule vanished and the
bug came back — even though the learned note already existed and looked
"resolved". Treat `wg0.conf` on CHR as the single source of truth; a fix that
isn't in `PostUp` doesn't actually exist after the next restart. The
authoritative, currently-correct config is checked into this repo at
`wireguard/wg0-chr.conf.example`.

## Verification

```bash
# From scraper VPS, after a clean `wg-quick down wg0 && wg-quick up wg0` on
# BOTH ends (to prove it survives from config alone, not leftover live rules):
dig @10.10.0.1 google.com +short +timeout=5      # should return real IPs
timeout 3 bash -c "echo >/dev/tcp/10.10.0.1/1883" && echo OPEN || echo REFUSED
```
