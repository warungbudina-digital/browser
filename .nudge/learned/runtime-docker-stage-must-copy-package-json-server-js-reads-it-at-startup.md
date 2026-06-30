# Runtime Docker stage must COPY package.json — server.js reads it at startup

## What went wrong

`full-tool-browser` container crashed immediately after start:

```
Error: ENOENT: no such file or directory, open '/app/package.json'
    at readFileSync (node:fs:442:20)
    at file:///app/src/server.js:19:3
```

`src/server.js` line 18–20 reads `package.json` synchronously at module load time:
```js
const { version: APP_VERSION } = JSON.parse(
  readFileSync(new URL('../package.json', import.meta.url), 'utf8')
);
```

The Dockerfile `runtime` stage only copied `src/`, `db/`, `examples/`, `README.md`
and `node_modules` — `package.json` itself was omitted.

## Fix

Add to the Dockerfile `runtime` stage before the `src` COPY:
```dockerfile
COPY package.json ./package.json
```

## Verification

```bash
docker compose up -d full-tool-browser
docker logs browser-full-tool-browser-1 --tail=5
# Should show "Server listening at http://..." not ENOENT
curl -sf -H "Authorization: Bearer $API_KEY" http://localhost:8080/health
# {"ok":true}
```
