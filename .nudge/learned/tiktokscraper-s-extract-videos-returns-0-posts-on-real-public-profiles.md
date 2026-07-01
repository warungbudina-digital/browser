# TikTokScraper's EXTRACT_VIDEOS returns 0 posts on real public profiles

## What went wrong

`src/scraper/platforms/tiktok.js`'s `TikTokScraper.scrape()` reliably
extracts the profile (username, bio, avatar, verified — via `__NEXT_DATA__`
or meta-tag fallback), but `EXTRACT_VIDEOS` returned an empty array in two
separate live end-to-end tests against real public accounts
(`https://www.tiktok.com/@tiktok` and `https://www.tiktok.com/@khaby.lame`,
both accounts with many public videos). The job completes successfully
(`status: "done"`, `error: null`) with `posts: []` — no error is surfaced,
so this silently looks like "it worked" unless you check `postCount`.

Root cause not fully diagnosed (out of scope to fix during this session —
this was pre-existing code, not something introduced by any change in this
session), but likely candidates: TikTok's `__NEXT_DATA__` no longer embeds
`props.pageProps.itemList` on first paint (lazy-loaded via a subsequent
XHR/GraphQL call instead), and/or the DOM fallback selector
`[data-e2e="user-post-item"]` no longer matches current TikTok markup
(TikTok changes their web app's markup periodically). The scraper's
`act('wait', {loadState:'networkidle', timeoutMs:20000})` + `warmup()` may
also not be enough time/interaction (e.g. scroll) to trigger the video
grid's lazy load.

## Fix

Not fixed — flagging for whoever next needs real TikTok video data out of
this scraper. Before assuming any pipeline/network problem when TikTok jobs
return `posts: []`, first re-inspect what's actually in `__NEXT_DATA__` /
the DOM live, since the SSRF/auth/queue/browser-pool layers can all be
completely healthy and profile extraction can succeed while VIDEO extraction
still comes back empty due to page-structure drift.

## Verification

```bash
# Confirm whether it's still empty, and inspect real page structure to debug:
curl -s -X POST http://localhost:8080/scraper/jobs \
  -H "Authorization: Bearer $API_KEY" -H "Content-Type: application/json" \
  -d '{"platform":"tiktok","targetUrl":"https://www.tiktok.com/@<known_active_account>"}'
# poll GET /scraper/jobs/:id until status=done, check `posts` length

# To inspect live page structure directly (bypassing the scraper's own logic):
curl -s -X POST http://localhost:8080/browser/request -H "Authorization: Bearer $API_KEY" \
  -H "Content-Type: application/json" \
  -d '{"action":"act","profile":"openclaw","request":{"kind":"evaluate","fn":"() => { const el = document.getElementById(\"__NEXT_DATA__\"); return el ? Object.keys(JSON.parse(el.textContent)?.props?.pageProps || {}) : null; }"}}'
```
