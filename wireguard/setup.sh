#!/bin/bash
set -euo pipefail

# =============================================================================
# Setup WireGuard client di VPS Scraper (full-tool-browser)
# Jalankan sebagai root/sudo di VPS Scraper.
#
# Sisi server (VPS CHR) di-setup lewat script terpisah di repo mikrotik-CHR:
# /root/mikrotik-CHR/wireguard/setup.sh — lihat README.md di folder ini.
# =============================================================================

WG_CONF="/etc/wireguard/wg0.conf"
KEY_DIR="/etc/wireguard"
PERSIST_DIR="$HOME/.wireguard-scraper"

# Idempotent: kalau wg0 sudah up dan sudah punya peer/endpoint terkonfigurasi,
# tidak perlu tanya ulang — ini yang bikin script ini aman dipanggil tanpa
# prompt dari installer utama (../setup.sh) di run berikutnya.
if wg show wg0 &>/dev/null && wg show wg0 | grep -q "endpoint:"; then
  echo "WireGuard wg0 sudah aktif dan terkonfigurasi — skip setup."
  wg show wg0
  exit 0
fi

echo "=== [1/6] Install WireGuard ==="
if ! command -v wg &>/dev/null; then
  apt-get update -qq
  apt-get install -y wireguard
fi
mkdir -p "$KEY_DIR" && chmod 700 "$KEY_DIR"

echo "=== [2/6] Keypair ==="
if [[ -f "$PERSIST_DIR/privatekey" ]]; then
  # Environment ephemeral (mis. Google Cloud Shell) yang sudah pernah setup
  # sebelumnya — restore key lama supaya public key tidak berubah dan tidak
  # perlu daftar ulang peer di CHR.
  echo "Restore keypair dari $PERSIST_DIR (session sebelumnya)."
  cp "$PERSIST_DIR/privatekey" "$PERSIST_DIR/publickey" "$KEY_DIR/"
elif [[ -f "$KEY_DIR/privatekey" ]]; then
  echo "Keypair sudah ada di $KEY_DIR, skip generate."
else
  wg genkey | tee "$KEY_DIR/privatekey" | wg pubkey > "$KEY_DIR/publickey"
fi
chmod 600 "$KEY_DIR/privatekey"

PRIVKEY=$(cat "$KEY_DIR/privatekey")
PUBKEY=$(cat "$KEY_DIR/publickey")

# Simpan salinan di $HOME (persistent) untuk environment ephemeral — lihat
# "Gotcha: environment ephemeral" di README.md.
mkdir -p "$PERSIST_DIR" && chmod 700 "$PERSIST_DIR"
cp "$KEY_DIR/privatekey" "$KEY_DIR/publickey" "$PERSIST_DIR/"
chmod 600 "$PERSIST_DIR/privatekey"

echo ""
echo "=== VPS Scraper Keys ==="
echo "Public Key : $PUBKEY"
echo "(private key tidak ditampilkan — ada di $KEY_DIR/privatekey dan $PERSIST_DIR/privatekey)"
echo ""

echo "=== [3/6] Input dari VPS CHR ==="
read -rp "Public Key VPS CHR   : " CHR_PUBKEY
read -rp "IP publik VPS CHR    : " CHR_IP

echo "=== [4/6] Tulis $WG_CONF ==="
cat > "$WG_CONF" <<EOF
[Interface]
# VPS Scraper — WireGuard client
Address = 10.10.0.2/24
PrivateKey = $PRIVKEY

# Routing: hanya traffic ke subnet WireGuard yang melalui tunnel
# (split tunnel — traffic internet lain tetap langsung, bukan lewat CHR)

[Peer]
# VPS CHR
PublicKey = $CHR_PUBKEY
Endpoint = $CHR_IP:51820
AllowedIPs = 10.10.0.0/24
# Keepalive penting di client agar koneksi tetap hidup lewat NAT
PersistentKeepalive = 25
EOF
chmod 600 "$WG_CONF"

echo "=== [5/6] Enable & start WireGuard ==="
if pidof systemd &>/dev/null && systemctl is-system-running &>/dev/null 2>&1; then
  systemctl enable wg-quick@wg0
  systemctl restart wg-quick@wg0
else
  # Systemd tidak aktif (Cloud Shell/container/k8s) — pakai wg-quick langsung.
  wg-quick down wg0 2>/dev/null || true
  wg-quick up wg0
  echo "[INFO] Systemd tidak tersedia — WireGuard TIDAK otomatis naik lagi"
  echo "       setelah environment reset. Jalankan ulang script ini di sesi baru"
  echo "       (keypair akan di-restore otomatis dari $PERSIST_DIR)."
fi

echo "=== [6/6] Tes koneksi ke VPS CHR ==="
sleep 2
if ping -c 2 -W 3 10.10.0.1 &>/dev/null; then
  echo "Koneksi ke VPS CHR (10.10.0.1) OK"
else
  echo "GAGAL ping ke 10.10.0.1."
  echo "Cek: 'sudo wg show wg0' (harus ada 'latest handshake'), dan pastikan"
  echo "public key di atas ($PUBKEY) sudah terdaftar sebagai [Peer] di"
  echo "wg0.conf VPS CHR (lihat README.md)."
fi

echo ""
sudo wg show wg0 || wg show wg0
echo ""
echo "Setup VPS Scraper selesai. Public Key: $PUBKEY"
