# WireGuard: Scraper VPS ↔ VPS CHR

Tunnel split: scraper VPS (client, `10.10.0.2`) memanggil DNS PiHole dan
MQTT broker yang jalan sebagai container Docker di VPS CHR (server, `10.10.0.1`).

## File di sini

- `wg0.conf` — template **client** (scraper VPS). Jalankan via `setup-scraper.sh`.
- `wg0-chr.conf.example` — template **server** (VPS CHR). Referensi saja —
  CHR bukan bagian dari repo ini, isi key asli ada di `/etc/wireguard/wg0.conf`
  di VPS CHR.

## Gotcha: Docker drop forwarded traffic dari wg0 ke bridge-nya sendiri

Symptom: handshake WireGuard sukses, `ping 10.10.0.1` jalan, tapi DNS
(`dig @10.10.0.1`) dan MQTT (`10.10.0.1:1883`) tetap gagal — DNS timeout,
MQTT connection refused.

Root cause (ditemukan via `nft list table ip filter` di CHR — `iptables -L`
biasa **tidak bisa dipercaya** di host ini karena backend aktifnya nftables,
counter yang ditampilkan tools legacy basa-basi/stale):

Docker generate rule catch-all di chain filter `DOCKER` miliknya sendiri:
```
iifname != "br-xxxxx" oifname "br-xxxxx" drop
```
Semua traffic yang di-forward MASUK ke bridge Docker dari interface lain
(termasuk `wg0`) di-drop kecuali cocok dengan published-port rule yang
Docker generate otomatis dari `docker-compose.yml` (`ports:`). PiHole tidak
publish port 53 ke host (cuma `expose`), jadi DNS-nya selalu kena drop ini —
walaupun DNAT di tabel `nat` sudah benar dan match (`dnat to 172.20.0.6:53`
bahkan ke-counter beberapa packet, tapi packet itu mati di tabel `filter`
sebelum sampai ke container).

Untuk MQTT, masalahnya beda lagi: DNAT yang ada di `docker-compose.yml`
CHR cuma scoped ke `daddr 127.0.0.1` (loopback publish), jadi traffic wg0
yang dituju ke `10.10.0.1:1883` tidak pernah ke-DNAT sama sekali — paket
diterima langsung oleh host sendiri (karena `10.10.0.1` adalah local address),
dan host reset koneksinya karena tidak ada yang listen di situ.

### Fix (sudah ada di `wg0-chr.conf.example`)

1. **Bypass drop Docker** — insert ACCEPT di `DOCKER-USER` (dievaluasi
   *sebelum* chain `DOCKER-FORWARD` milik Docker) untuk traffic `wg0 <->`
   bridge docker (`mikrotik-net`, nama bridge: `docker network inspect
   mikrotik-net --format '{{.Id}}' | cut -c1-12` -> `br-<12 char>`).
2. **DNAT khusus wg0 untuk MQTT** — tambah rule `PREROUTING -i wg0 -p tcp
   --dport 1883/9001 -j DNAT --to-destination <mosquitto-ip>:1883/9001`,
   terpisah dari rule `daddr 127.0.0.1` yang sudah ada (yang itu untuk akses
   lokal di host CHR sendiri, jangan dihapus).
3. **MASQUERADE `10.10.0.0/24 -> 172.20.0.0/24`** — supaya reply dari
   container ter-translate balik dengan benar.

Semua tiga rule itu harus persist di `PostUp`/`PostDown` `wg0.conf` CHR,
bukan cuma di-apply manual via `iptables -A` — kalau cuma manual dan
WireGuard interface-nya restart/reboot, rule-nya hilang.

## Verifikasi

Dari scraper VPS, setelah tunnel up:

```bash
# Handshake & tunnel dasar
sudo wg show wg0          # harus ada "latest handshake"
ping -c3 10.10.0.1        # harus 0% loss

# DNS via PiHole
dig @10.10.0.1 google.com +short +timeout=5      # harus return IP asli
dig @10.10.0.1 datadome.co +short +timeout=5     # harus 0.0.0.0 (PiHole block)

# MQTT broker
timeout 3 bash -c "echo >/dev/tcp/10.10.0.1/1883" && echo OPEN || echo REFUSED
```

Kalau handshake/ping OK tapi DNS atau MQTT gagal, cek dulu apakah ini bug
yang sama: di CHR, `sudo nft list table ip filter` (bukan `iptables -L`)
lalu cari counter yang nempel di rule drop chain `DOCKER` — kalau jumlahnya
naik tiap kali kamu coba dari scraper, itu konfirmasi gotcha di atas.

## Persistensi key di lingkungan ephemeral (Cloud Shell dll)

`/etc/wireguard` ada di disk VM yang ephemeral di beberapa environment
(misalnya Google Cloud Shell — hilang total tiap sesi baru). Simpan salinan
key + config di `$HOME` (yang persisten) di luar repo ini, lalu buat script
restore kecil yang reinstall WireGuard + copy balik ke `/etc/wireguard` +
`wg-quick up wg0` di awal tiap sesi baru. Public key tidak berubah, jadi
tidak perlu daftar ulang peer di CHR.
