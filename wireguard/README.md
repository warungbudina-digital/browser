# WireGuard: VPS Scraper ↔ VPS CHR

Tunnel split: VPS Scraper (client, `10.10.0.2`, jalan repo `full-tool-browser`
ini) memanggil DNS PiHole dan MQTT broker yang jalan sebagai container Docker
di VPS CHR (server, `10.10.0.1`).

Sisi CHR **bukan** bagian dari repo ini — setup-nya ada di script terpisah di
repo `mikrotik-CHR` (`/root/mikrotik-CHR/wireguard/setup.sh` di VPS CHR).

## Cara pakai

Di VPS Scraper, sebagai root/sudo:

```bash
./setup.sh
```

Script akan minta **Public Key** dan **IP publik VPS CHR** secara interaktif
(dapatkan dari output `setup.sh` sisi CHR, atau `cat /etc/wireguard/publickey`
di VPS CHR). Setelah selesai, tempel **Public Key VPS Scraper** yang
ditampilkan di akhir run ke `[Peer]` di `wg0.conf` VPS CHR.

Urutan: jalankan setup CHR dulu (butuh public key scraper untuk peer entry),
atau jalankan scraper dulu lalu update peer CHR belakangan — keduanya bisa,
WireGuard baru handshake setelah kedua sisi saling kenal public key masing-masing.

## Verifikasi

```bash
# Handshake & tunnel dasar
sudo wg show wg0          # harus ada baris "latest handshake"
ping -c3 10.10.0.1         # harus 0% loss

# DNS via PiHole
dig @10.10.0.1 google.com +short +timeout=5      # harus return IP asli
dig @10.10.0.1 datadome.co +short +timeout=5     # harus 0.0.0.0 (PiHole block)

# MQTT broker
timeout 3 bash -c "echo >/dev/tcp/10.10.0.1/1883" && echo OPEN || echo REFUSED
```

Kalau tidak ada "latest handshake" sama sekali: public key salah satu sisi
kemungkinan belum terdaftar sebagai peer di sisi lain, atau `wg0.conf` di
salah satu sisi baru diedit tapi service belum di-reload (`systemctl restart
wg-quick@wg0` — edit file config saja tidak otomatis apply ke interface yang
sudah jalan).

## Gotcha: environment ephemeral (Google Cloud Shell dll.)

`/etc/wireguard` ada di disk yang ephemeral di beberapa environment (Cloud
Shell menghapus total tiap sesi baru — key hilang, keypair baru berarti
public key baru, berarti perlu daftar ulang peer di CHR tiap kali).

Fix: `setup.sh` di folder ini otomatis menyimpan salinan keypair ke
`$HOME/.wireguard-scraper/` (persistent, di luar repo git) dan me-restore-nya
di run berikutnya kalau ada, jadi public key tidak pernah berubah lintas
sesi setelah setup pertama kali.

## Gotcha: Docker drop forwarded traffic dari wg0 ke bridge-nya sendiri (sisi CHR)

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

Untuk MQTT, masalahnya beda lagi: DNAT default di `docker-compose.yml` CHR
cuma scoped ke `daddr 127.0.0.1` (loopback publish), jadi traffic wg0 yang
dituju ke `10.10.0.1:1883` tidak pernah ke-DNAT sama sekali — paket diterima
langsung oleh host sendiri (karena `10.10.0.1` adalah local address), dan
host reset koneksinya karena tidak ada yang listen di situ.

**Fix sudah dibakukan** di `wg0.conf` yang ditulis oleh `setup.sh` sisi CHR
(`/root/mikrotik-CHR/wireguard/setup.sh`): bypass drop Docker via
`DOCKER-USER` (dievaluasi sebelum `DOCKER-FORWARD` milik Docker), DNAT
khusus wg0 untuk MQTT (terpisah dari rule `daddr 127.0.0.1` yang sudah ada —
itu untuk akses lokal di host CHR sendiri, jangan dihapus), dan MASQUERADE
`10.10.0.0/24 -> 172.20.0.0/24` supaya reply dari container ter-translate
balik dengan benar. Semua tiga rule itu ada di `PostUp`/`PostDown`, bukan
manual `iptables -A` — kalau cuma manual dan WireGuard-nya restart/reboot,
rule-nya hilang.

Kalau handshake/ping OK tapi DNS atau MQTT gagal lagi, cek di CHR:
`sudo nft list table ip filter` (bukan `iptables -L`) — cari counter yang
nempel di rule drop chain `DOCKER`, kalau naik tiap kali kamu coba dari
scraper, itu konfirmasi gotcha ini balik lagi (mis. `wg0.conf` CHR ke-reset
ke versi lama tanpa fix di atas).
