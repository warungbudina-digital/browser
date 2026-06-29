# SCRAPERS object must be exported from ScraperService.js for JobQueue import

## What went wrong
JobQueue.js imports SCRAPERS directly from ScraperService.js to run the correct
platform scraper inside the BullMQ worker. The original code had SCRAPERS as a
module-level const without export, causing a named import failure at runtime:

  SyntaxError: The requested module './ScraperService.js' does not provide
  an export named 'SCRAPERS'

## Fix
Add `export` to the SCRAPERS declaration in ScraperService.js:

```js
// Before
const SCRAPERS = { instagram: ..., tiktok: ..., twitter: ... };

// After
export const SCRAPERS = { instagram: ..., tiktok: ..., twitter: ... };
```

## Verification
```
node --check src/queue/JobQueue.js   # no error
node -e "import('./src/scraper/ScraperService.js').then(m => console.log(Object.keys(m.SCRAPERS)))"
# prints: [ 'instagram', 'tiktok', 'twitter' ]
```
