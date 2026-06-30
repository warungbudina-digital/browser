# itemku.com category URLs and product card selectors used by examples/itemku-scrape.sh

## What went wrong

`examples/itemku-scrape.sh` originally opened `https://www.itemku.com/g/game-currency`,
which does not exist on the live site — it silently redirects to the
homepage (`/en/`) with HTTP 200, so there's no obvious error, just an
extraction that returns zero products. The original selectors
(`[class*=product-card]`, `a[href*=/p/]`, etc.) also don't match itemku's
real markup at all: it's a Tailwind-utility-class site with no semantic
`product-card`/`title`/`price` class names, and product detail links are
`/product/<slug>/<id>`, not `/p/`.

## Fix

Use a real category URL, e.g. `https://www.itemku.com/en/g/mobile-legends/akun`
(pattern: `/en/g/<game-slug>/<item-type-slug>`). For extraction, itemku's
product cards (as of this session) DO have stable element `id` prefixes that
survive the Tailwind class churn:
- `a[href*="/product/"]` — the card link itself
- `[id*=card-product][id*=-name]` — title (nested `<h3><span>`)
- `[id*=card-product][id*=-price]` — price (currency shown is region-dependent,
  e.g. `SGD 36.66`, not always `Rp`/IDR)
- `[id*=card-product][id*=-statistic]` — sold count + rating, e.g. "17100 Sold 4.9"
- standard `img` inside the card for the thumbnail

## Verification

```bash
bash examples/itemku-scrape.sh
# step 4 result should have result.count > 0 and populated product titles/prices,
# not {"count":0,"products":[]}
```
