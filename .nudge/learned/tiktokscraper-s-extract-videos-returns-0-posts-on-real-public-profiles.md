# TikTokScraper's EXTRACT_VIDEOS returns 0 posts — TikTok serves a slider CAPTCHA, not a markup-drift issue

## What went wrong

`src/scraper/platforms/tiktok.js`'s `TikTokScraper.scrape()` reliably
extracts the profile (username, bio, avatar, verified — via `__NEXT_DATA__`
or meta-tag fallback), but `EXTRACT_VIDEOS` returned an empty array in live
end-to-end tests against real public accounts
(`https://www.tiktok.com/@tiktok` and `https://www.tiktok.com/@khaby.lame`,
both accounts with many public videos). The job completes successfully
(`status: "done"`, `error: null`) with `posts: []` — no error is surfaced,
so this silently looks like "it worked" unless you check `postCount`.

**Confirmed root cause** (via direct `/browser/request` evaluate inspection,
not just theorizing): TikTok serves an anti-bot **slider CAPTCHA**
("Drag the slider to fit the puzzle") to this profile/session before the
video grid (or even `__NEXT_DATA__`) renders. Confirmed via:
```js
document.body.innerText // contains "Drag the slider to fit the puzzle"
document.getElementById('__NEXT_DATA__') // null — page never hydrates past the captcha
```
Profile info (username/bio/followers) still shows because it's rendered
server-side around/before the captcha overlay, which is why profile
extraction looked "fine" while video extraction silently came back empty —
easy to misdiagnose as a selector/markup problem (an earlier version of this
note did exactly that) when it's actually TikTok's bot detection blocking
the whole page, datacenter-VPS-IP-triggered and/or fingerprint-triggered.

## Fix

Not fixed — deliberately out of scope (user decision: skip captcha
bypass/evasion work for now, revisit later). Plausible directions for a
future session, roughly in order of how invasive they are:
1. Strengthen stealth/fingerprint further (`BROWSER_STEALTH=true` is already
   set but evidently insufficient on its own against TikTok specifically) —
   check timing/interaction patterns, not just UA/fingerprint spoofing.
2. Use an authenticated session (logged-in cookies) instead of an anonymous
   visitor — TikTok may not challenge known-good sessions as aggressively.
   Blocked on not having TikTok auth cookies available yet (separate,
   already-known limitation).
3. Route scraping traffic through a different egress IP — this scraper VPS's
   datacenter IP is a very plausible trigger. Note: CHR's MikroTik container
   is currently just a router/WireGuard endpoint with ONE static IP, not a
   rotating proxy pool — "optimize MikroTik CHR for this" would require new
   infrastructure, not just configuration.

Before assuming any pipeline/network problem when TikTok jobs return
`posts: []`, always re-check `document.body.innerText` for a captcha/puzzle
prompt FIRST — the SSRF/auth/queue/browser-pool layers can all be completely
healthy and profile extraction can succeed while a captcha silently blocks
just the video grid.

## Verification

```bash
# Confirm whether it's still empty, and check for the captcha specifically:
curl -s -X POST http://localhost:8080/browser/request -H "Authorization: Bearer $API_KEY" \
  -H "Content-Type: application/json" \
  -d '{"action":"act","profile":"openclaw","request":{"kind":"evaluate","fn":"() => ({ hasNextData: !!document.getElementById(\"__NEXT_DATA__\"), bodyTextSnippet: document.body.innerText.slice(0,300) })"}}'
# bodyTextSnippet containing "Drag the slider" / "puzzle" confirms the captcha, not a selector bug
```
