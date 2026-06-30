# WireGuard→Docker DNS routing needs MASQUERADE + DOCKER-USER rules beyond DNAT

## What went wrong

WireGuard client (scraper VPS 10.10.0.2) sent DNS queries to 10.10.0.1:53.
Iptables PREROUTING had a correct DNAT rule redirecting port 53 → Pi-hole at
172.20.0.6:53. But queries still timed out.

Two missing pieces:
1. No POSTROUTING MASQUERADE for WireGuard→Docker subnet: Pi-hole received
   packets with source IP 10.10.0.2 (WireGuard), couldn't route the reply back.
2. Docker's DOCKER-ISOLATION-STAGE-2 chain drops cross-network packets before
   the generic FORWARD ACCEPT rules run, silently dropping wg0→br-xxx traffic.

## Fix

```bash
# 1. MASQUERADE so Pi-hole sees queries as coming from Docker gateway
iptables -t nat -A POSTROUTING -s 10.10.0.0/24 -d 172.20.0.0/24 -j MASQUERADE

# 2. Allow wg0↔Docker bridge BEFORE Docker isolation rules
BRNAME=$(docker network inspect mikrotik-net --format '{{.Id}}' | cut -c1-12)
BRNAME="br-$BRNAME"
iptables -I DOCKER-USER 1 -i wg0 -o $BRNAME -j ACCEPT
iptables -I DOCKER-USER 2 -i $BRNAME -o wg0 -j ACCEPT
```

Persist via systemd service at `/etc/systemd/system/iptables-docker-wg.service`
(bridge name must be resolved at service start time, not hardcoded).

Add to wg0.conf PostUp/PostDown to survive WireGuard restarts:
```
PostUp = iptables -t nat -A POSTROUTING -s 10.10.0.0/24 -d 172.20.0.0/24 -j MASQUERADE
```

## Verification

```bash
dig @10.10.0.1 google.com +short +timeout=5
# Returns real IPs (not timeout)

dig @10.10.0.1 datadome.co +short +timeout=5
# Returns 0.0.0.0 (Pi-hole blocked)
```
