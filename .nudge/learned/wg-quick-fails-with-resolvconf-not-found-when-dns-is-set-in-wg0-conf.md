# wg-quick fails with resolvconf not found when DNS is set in wg0.conf

## What went wrong
`wireguard/wg0.conf` has `DNS = 10.10.0.1`. When `wg-quick up wg0` runs in Cloud Shell,
it tries to call `resolvconf` to apply the DNS setting, but the binary is not installed:

```
[#] resolvconf -a wg0 -m 0 -x
/usr/bin/wg-quick: line 32: resolvconf: command not found
[#] ip link delete dev wg0
```
wg-quick rolls back the interface and exits with error 127.

## Fix
Remove the `DNS =` line from `/etc/wireguard/wg0.conf` in the Cloud Shell environment.
The scraper VPS doesn't need DNS routed through the WireGuard tunnel — it uses the
host's DNS directly.

```bash
sudo sed -i '/^DNS = /d' /etc/wireguard/wg0.conf
```

The template at `wireguard/wg0.conf` still contains the DNS line for reference;
it must be stripped before starting WireGuard on environments without resolvconf.

## Verification
```bash
wg-quick up wg0   # should complete without resolvconf error
wg show wg0       # interface should show as up
```
