# Skills

Referensi skill eksternal yang berpotensi diintegrasikan ke project ini.

## Struktur

```
skill/
├── tiktok-uploader/           # v0.1.0 — upload video ke TikTok via browser automation
├── tiktok-growth-os/          # v3.0.0 — content strategy, hooks, scripts, analytics
├── facebook-page/             # v1.0.16 — Meta Graph API v25.0 page manager
└── social-media-scheduler/    # v1.0.0 — AI content calendar & platform-optimized drafting
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

---

## facebook-page (v1.0.16)

**Sumber:** ClawHub / seph1709 · MIT License

**Fungsi:** Manage Facebook Page via Meta Graph API v25.0 — post, schedule, reply, moderation, insights, events.

**Mekanisme:**
- Pure REST API — `fetch()` / PowerShell `Invoke-RestMethod` ke `graph.facebook.com`
- Auth: long-lived Page Access Token di `~/.config/fb-page/credentials.json`
- Tidak butuh browser, tidak ada scraping, resmi dan versioned

**Operasi:** post text/image/video/link, schedule post, delete, get insights, reply/hide/delete comment, create event, get page info.

**Rencana integrasi:**
- Implementasi native sebagai `FacebookPageClient.js` di Node.js menggunakan `fetch()`
- Tambah route `POST /facebook/page` dengan action: post, schedule, delete, insights, dll
- Baca credentials dari `~/.config/fb-page/credentials.json`
- **Prioritas integrasi tertinggi** — paling reliable karena pakai official API

**File kunci:** `SKILL.md`, `README.md`

---

---

## social-media-scheduler (v1.0.0)

**Sumber:** ClawHub / 1kalin

**Fungsi:** Pure AI prompt skill — content calendar, platform-optimized drafting, content pillars, repurposing map, hashtag strategy.

**Mekanisme:**
- Tidak ada kode — hanya `SKILL.md` yang berisi system prompt untuk model AI
- Output: Markdown terstruktur, siap copy-paste, dengan character count per platform
- Platform: Twitter/X, LinkedIn, Instagram, TikTok, Facebook
- 6 content pillars: Educational, BTS, Social Proof, Entertainment, Promotional, Community

**Rencana integrasi:**
- Inject `SKILL.md` sebagai system prompt ke Claude API call untuk session content planning
- Bisa jadi route `POST /content/plan` yang forward ke Claude API → hasilnya di-pipe ke publisher
- Berperan sebagai **content generation layer** sebelum facebook-page / tiktok-uploader

**Catatan:** Output teks/markdown — butuh parsing untuk extract structured data (tanggal, platform, teks) sebelum bisa diotomasi ke publisher.

**File kunci:** `SKILL.md`, `README.md`

---

## Pipeline potensial

```
social-media-scheduler    → AI generate: calendar, caption, hashtag, CTA   ← NEW
    ↓
tiktok-growth-os          → generate hooks + script tambahan
    ↓
facebook-page             → post ke Facebook Page via Graph API
tiktok-uploader           → upload video ke TikTok
    ↓
full-tool-browser         → scrape metrics dari kedua platform
    ↓
tiktok-growth-os          → log_performance + analyze_patterns → refine strategy
```
