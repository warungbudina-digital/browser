# Skills

Referensi skill eksternal yang berpotensi diintegrasikan ke project ini.

## Struktur

```
skill/
├── tiktok-uploader/           # v0.1.0 — upload video ke TikTok via browser automation
├── tiktok-growth-os/          # v3.0.0 — content strategy, hooks, scripts, analytics
├── facebook-page/             # v1.0.16 — Meta Graph API v25.0 page manager
├── social-media-scheduler/    # v1.0.0 — AI content calendar & platform-optimized drafting
└── ipstory/                   # v1.0.0 — AI personal brand story generator (5-step framework)
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

**Status integrasi:**
- **Implemented** — `src/scraper/TiktokGrowthOsBridge.js` otomatis log hasil
  scrape TikTok (dari job gRPC CHR → `/scraper/jobs` → `TikTokScraper`) ke
  `analytics.json` skill ini, dalam schema yang sama dengan `make_video_log()`
  (lihat `scripts/lib/schema.py`). Aktifkan via `TIKTOK_GROWTH_OS_BRIDGE_ENABLED=true`
  di `.env`. `topic`/`angle`/`hook_type` selalu kosong untuk entry hasil
  scrape (tidak ada korelasi ke `content_bank.json` yang direncanakan secara
  manual) dan `completion_rate` selalu `0` (TikTok tidak expose retention
  rate di profil publik — hanya tersedia di creator analytics yang butuh
  login). Jalankan `scripts/analyze_patterns.py` di HOST (bukan di container)
  untuk regenerate `pattern_report.json` setelah scrape job baru selesai.
- Belum: input layer (Claude generate konten → tiktok-uploader upload) — di
  luar scope v1 ini, upload/posting TikTok belum diimplementasi.

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

---

## ipstory (v1.0.0)

**Sumber:** ClawHub / fengbabao0929 · "IP" = 個人IP (personal brand, istilah creator China)

**Fungsi:** Pure AI prompt skill — generate personal brand story menggunakan 5-step framework: Pain Resonance → Turning Point → Conflict → Philosophy → Results.

**Mekanisme:**
- Tidak ada kode — hanya `SKILL.md` sebagai system prompt + referensi + templates
- Output: Markdown narrative, outline, story draft siap edit
- 3 story patterns: Corporate Escape, Expert to Authority, Phoenix Rising
- Referensi kisah nyata: Wanying (2.400/bln → 6 juta/bln via WeChat business)
- Template per industri di `references/templates.md`

**Rencana integrasi:**
- Inject `SKILL.md` sebagai system prompt untuk session personal branding
- **Foundation layer** sebelum `social-media-scheduler`: ipstory generate brand story → scheduler pecah jadi konten harian per platform
- Bisa jadi route `POST /content/brand-story` ke Claude API

**File kunci:** `SKILL.md`, `references/templates.md`, `references/reference.md`

---

## Pipeline potensial

```
ipstory                   → AI generate: brand story, bio, origin narrative   ← NEW
    ↓
social-media-scheduler    → AI generate: calendar, caption, hashtag, CTA
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
