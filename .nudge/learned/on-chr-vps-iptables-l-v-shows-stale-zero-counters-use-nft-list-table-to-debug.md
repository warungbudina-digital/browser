# On CHR VPS, `iptables -L`/`-v` shows stale/zero counters — use `nft list table` to debug

## What went wrong

While debugging why DNS and MQTT traffic from the scraper VPS (over WireGuard)
were silently failing despite seemingly-correct DNAT rules, `sudo iptables -t nat
-L PREROUTING -n -v --line-numbers` showed all relevant rules with `0 packets, 0
bytes` even immediately after sending real traffic that should have matched them.
This made it look like the DNAT rules weren't being hit at all, which was a red
herring.

Root cause: this host (Ubuntu 24.04 + Docker) runs the nftables backend
(`iptables --version` → `iptables v1.8.10 (nf_tables)`, `update-alternatives
--display iptables` → points to `iptables-nft`). Docker manages its own rules
directly via `nft`, and the legacy `iptables -L` view can show duplicated/stale
rule entries with counters that don't reflect the real active ruleset.

## Fix

Always cross-check real packet counters with the native nft tool when debugging
on a host with the nftables backend:

```bash
sudo nft list table ip nat
sudo nft list table ip filter
```

These show the true, currently-enforced ruleset and counters (e.g. confirmed a
DNS DNAT rule actually had matched 12 packets while the `iptables -t nat -L -v`
view showed 0 for the same rule). Use this to find exactly which rule/chain a
packet is hitting, instead of trusting the legacy iptables counter view.

## Verification

```bash
# Send test traffic, then immediately check both views — if iptables -L stays
# at 0 but nft shows non-zero, you're looking at the wrong (legacy) view.
sudo nft list table ip nat | grep -A2 'dnat to'
```
