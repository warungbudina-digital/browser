# Google Cloud Shell wipes /etc/wireguard on session reset — persist keys under $HOME instead

## What went wrong

`apt-get install` in this environment prints: "You are running apt-get inside
of Cloud Shell. Note that your Cloud Shell machine is ephemeral and no
system-wide change will persist beyond session end." `/etc/wireguard`
(privatekey, publickey, wg0.conf) lives on that ephemeral VM disk, so a new
Cloud Shell session starts with WireGuard not installed and no key material
at all — generating a fresh keypair each time would require re-registering a
new public key with the CHR VPS peer every session.

Only `$HOME` (e.g. `/home/<user>/`, including this repo's working copy) is
on Cloud Shell's persistent disk and survives a session reset.

## Fix

After generating the scraper VPS's WireGuard keypair, copy it to a location
under `$HOME` outside the git repo (so the private key is never at risk of
being committed), and write a small restore script that reinstalls
WireGuard + restores the same key + brings the tunnel up:

```bash
mkdir -p "$HOME/.wireguard-scraper" && chmod 700 "$HOME/.wireguard-scraper"
sudo cp /etc/wireguard/{privatekey,publickey,wg0.conf} "$HOME/.wireguard-scraper/"
sudo chown "$(id -u):$(id -g)" "$HOME/.wireguard-scraper/"*
chmod 600 "$HOME/.wireguard-scraper/privatekey" "$HOME/.wireguard-scraper/wg0.conf"
```

Restore script (`$HOME/.wireguard-scraper/restore.sh`) for the next session:
```bash
sudo apt-get update -qq && sudo apt-get install -y wireguard
sudo mkdir -p /etc/wireguard && sudo chmod 700 /etc/wireguard
sudo cp "$HOME/.wireguard-scraper"/{privatekey,publickey,wg0.conf} /etc/wireguard/
sudo chmod 600 /etc/wireguard/privatekey /etc/wireguard/wg0.conf
sudo chmod 644 /etc/wireguard/publickey
sudo wg-quick up wg0
```

The public key never changes across resets, so the CHR-side peer entry
doesn't need to be touched again.

## Verification

```bash
sudo wg show wg0   # after running restore.sh in a brand-new session, should
                    # show the same public key as before the reset and (once
                    # CHR's peer is configured) a successful handshake
```
