# setup.sh uses systemctl for WireGuard but Cloud Shell/container is non-systemd

## What went wrong
`setup.sh` and `wireguard/setup-scraper.sh` call `systemctl enable/start wg-quick@wg0`
and `systemctl is-active wg-quick@wg0`. When run in Google Cloud Shell (Kubernetes pod),
systemd is not PID 1 so all systemctl calls fail:

```
System has not been booted with systemd as init system (PID 1). Can't operate.
Failed to connect to bus: Host is down
```

## Fix
Detect systemd at runtime before using it. Both scripts now have a guard:

```bash
if pidof systemd &>/dev/null && systemctl is-system-running &>/dev/null 2>&1; then
  systemctl enable --now wg-quick@wg0
else
  wg-quick up wg0
fi
```

`setup.sh` uses `wg_is_active()` (checks `wg show wg0`) and `wg_start()` helper pair.
`wireguard/setup-scraper.sh` step [4/5] has the same inline guard plus rc.local fallback.

## Verification
```bash
wg show wg0          # shows interface if up
ping -c1 10.10.0.1   # confirms tunnel is live
```
