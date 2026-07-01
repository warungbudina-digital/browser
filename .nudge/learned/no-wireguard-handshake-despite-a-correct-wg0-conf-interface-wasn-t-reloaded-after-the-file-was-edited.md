# No WireGuard handshake despite a correct wg0.conf — interface wasn't reloaded after the file was edited

## What went wrong

Scraper VPS's `wg0` came up (`wg-quick up wg0` succeeded, interface exists,
keepalive packets sending) but `wg show wg0` never showed a "latest
handshake" line, and `ping 10.10.0.1` lost 100%. Direct ping to CHR's public
IP worked fine, so it wasn't a network/egress problem.

On CHR, `/etc/wireguard/wg0.conf`'s `[Peer] PublicKey` already matched the
scraper's current public key (file mtime was recent, so it had been edited
correctly at some point). But `sudo wg show wg0` on CHR showed a **different**
peer public key than what was in the file — the *running* `wg0` interface
still had a stale peer from before the file was last edited. Editing
`wg0.conf` does not push the new config into an already-running WireGuard
interface; only `wg-quick up`/`down` (or `wg syncconf`) does that.

Always check both, they can silently disagree:
```bash
sudo wg show wg0                                    # what's ACTIVE in the kernel right now
sudo grep PublicKey /etc/wireguard/wg0.conf          # what's in the FILE
```

## Fix

```bash
sudo systemctl restart wg-quick@wg0   # CHR runs systemd, this is safe — PostDown then PostUp re-applies all iptables rules
```
(On a non-systemd host use `wg-quick down wg0 && wg-quick up wg0` instead —
see the separate note on Cloud Shell/container environments lacking systemd.)

## Verification

```bash
sudo wg show wg0
# expect a "latest handshake: N seconds ago" line and non-zero "received" bytes

# from the peer side:
ping -c3 10.10.0.1   # or whichever internal tunnel IP is the other side
```
