# Changing DB_PASSWORD in .env doesn't take effect on an already-initialized Postgres volume

## What went wrong

After the `postgres` service's `postgres-data` volume had already been
created and initialized (first `docker compose up`), changing `DB_PASSWORD`
in `.env` and restarting did NOT change the actual database password.
PostgreSQL only applies `POSTGRES_PASSWORD` when initializing a fresh, empty
`PGDATA` directory. With the old password still baked into the volume,
`full-tool-browser` (which reads the new `DB_PASSWORD` from the same `.env`)
fails to authenticate to Postgres after the next restart.

## Fix

Either:
1. Wipe and reinitialize (only safe if the data is disposable/test data):
   ```bash
   docker compose down -v   # removes postgres-data volume
   docker compose up -d
   ```
2. Or keep the data and change the live password instead:
   ```bash
   docker exec -it scraper-db psql -U scraper -d scraper \
     -c "ALTER USER scraper PASSWORD '<new password>';"
   ```
   then update `.env` to match before the next restart.

## Verification

```bash
docker compose logs full-tool-browser --tail=20 | grep -i "DataStore\|postgres\|ECONNREFUSED\|password authentication"
# should show "[DataStore] PostgreSQL schema ready", not an auth failure
```
