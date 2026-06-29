#!/bin/bash
set -euo pipefail

# =============================================================================
# Setup WireGuard di VPS Scraper (client side)
# Jalankan sebagai root di VPS Scraper
# =============================================================================

REPO_DIR="$(cd "$(dirname "$0")/.." && pwd)"
WG_CONF="/etc/wireguard/wg0.conf"
KEY_DIR="/etc/wireguard"

echo "=== [1/5] Install WireGuard ==="
apt-get update -qq
apt-get install -y wireguard

echo "=== [2/5] Generate keypair ==="
if [[ -f "$KEY_DIR/privatekey" ]]; then
  echo "Keypair sudah ada, skip generate."
else
  wg genkey | tee "$KEY_DIR/privatekey" | wg pubkey > "$KEY_DIR/publickey"
  chmod 600 "$KEY_DIR/privatekey"
fi

PRIVKEY=$(cat "$KEY_DIR/privatekey")
PUBKEY=$(cat "$KEY_DIR/publickey")

echo ""
echo "=== VPS Scraper Keys ==="
echo "Private Key : $PRIVKEY  (jangan dibagikan)"
echo "Public Key  : $PUBKEY   (masukkan ke wg0.conf VPS CHR sebagai REPLACE_WITH_SCRAPER_PUBLIC_KEY)"
echo ""

echo "=== [3/5] Install konfigurasi WireGuard ==="
cp "$REPO_DIR/wireguard/wg0.conf" "$WG_CONF"
sed -i "s|REPLACE_WITH_SCRAPER_PRIVATE_KEY|$PRIVKEY|g" "$WG_CONF"

echo ""
echo "PERHATIAN: Edit $WG_CONF dan isi:"
echo "  - REPLACE_WITH_CHR_PUBLIC_KEY  → public key dari VPS CHR"
echo "  - REPLACE_WITH_CHR_PUBLIC_IP   → IP publik VPS CHR"
echo ""
read -rp "Sudah diisi? (y/N) " confirm
[[ "$confirm" =~ ^[Yy]$ ]] || { echo "Aborted."; exit 1; }

echo "=== [4/5] Enable & start WireGuard ==="
systemctl enable wg-quick@wg0
systemctl start wg-quick@wg0

echo "=== [5/5] Test koneksi ke VPS CHR ==="
sleep 2
if ping -c 2 -W 3 10.10.0.1 &>/dev/null; then
  echo "Koneksi ke VPS CHR (10.10.0.1) OK"
else
  echo "GAGAL ping ke 10.10.0.1. Cek: wg show, firewall, dan public key."
fi

echo ""
echo "=== Status WireGuard ==="
wg show

echo ""
echo "Setup VPS Scraper selesai!"
echo "Public Key Scraper: $PUBKEY"
