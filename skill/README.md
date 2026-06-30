# Skills

Referensi skill eksternal yang berpotensi diintegrasikan ke project ini.

## Struktur

```
skill/
├── tiktok-uploader/          # v0.1.0 — upload video ke TikTok via browser automation
└── tiktok-growth-os/         # v3.0.0 — content strategy, hooks, scripts, analytics
```

---

## tiktok-uploader (v0.1.0)

**Sumber:** ClawHub / [wkaisertexas/tiktok-uploader](https://github.com/wkaisertexas/tiktok-uploader)

**Fungsi:** Upload, schedule, dan batch-manage video TikTok via Playwright browser automation.

**Mekanisme:**
- Python + `tiktok-uploader` pip package
- Auth via cookies.txt, sessionid, atau cookie list
- `TikTokManager` wrapper class untuk single upload, batch, schedule, dan scan direktori

**Rencana integrasi:**
- Tambah route `POST /tiktok/upload` di server yang invoke `scripts/tiktok_manager.py` via subprocess
- ATAU reimplementasi native Node.js menggunakan Playwright yang sudah ada (BrowserService + formFill + upload action)
- Cocok digabung dengan `tiktok-growth-os` sebagai execution layer

**File kunci:** `scripts/tiktok_manager.py`, `SKILL.md`

---

## tiktok-growth-os (v3.0.0)

**Sumber:** ClawHub / author: cj

**Fungsi:** Content strategy OS — generate hooks, scripts, analisis retensi, dan pattern report berbasis analytics lokal.

**Mekanisme:**
- Pure Python scripts, zero browser automation
- Storage lokal: `~/.openclaw/workspace/memory/tiktok/*.json`
- `analyze_patterns.py` — group by angle/hook/topic, rank by completion rate + views
- Tidak ada TikTok API, tidak ada login, tidak ada scraping

**Rencana integrasi:**
- Bisa jadi input layer: Claude generate konten → tiktok-uploader upload
- `analyze_patterns.py` bisa jadi inspirasi scraper analytics kalau repo ini tambah TikTok metrics scraping
- Untuk sekarang: referensi content strategy logic dan schema `analytics.json`

**File kunci:** `SKILL.md`, `references/hooks.md`, `references/retention.md`, `scripts/analyze_patterns.py`

---

## Pipeline potensial

```
tiktok-growth-os          → generate hooks + script
    ↓
tiktok-uploader           → upload video
    ↓
full-tool-browser         → scrape metrics dari TikTok web
    ↓
tiktok-growth-os          → log_performance + analyze_patterns → refine strategy
```
