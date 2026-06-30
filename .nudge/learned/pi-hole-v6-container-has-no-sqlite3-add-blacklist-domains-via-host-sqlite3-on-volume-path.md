# Pi-hole v6 container has no sqlite3 — add blacklist domains via host sqlite3 on volume path

## What went wrong

Attempting to add custom blacklist domains via:
```bash
docker exec pihole sqlite3 /etc/pihole/gravity.db "INSERT ..."
```
Failed with:
```
OCI runtime exec failed: exec failed: unable to start container process:
exec: "sqlite3": executable file not found in $PATH: unknown
```

Pi-hole v6 (tested v6.4.2) does not include `sqlite3` in the container image.
The `pihole -b domain` CLI command also silently fails in v6 (prints help text).

## Fix

1. Install sqlite3 on the CHR host: `sudo apt-get install -y sqlite3`
2. Find gravity.db via the Docker volume mount on host:
   ```bash
   docker inspect pihole --format '{{json .Mounts}}' | python3 -c "
   import sys,json; [print(m['Source'],'->',m['Destination']) for m in json.load(sys.stdin)]"
   # /var/lib/docker/volumes/mikrotik-chr_pihole-data/_data -> /etc/pihole
   ```
3. Write directly to gravity.db from host:
   ```bash
   DB='/var/lib/docker/volumes/mikrotik-chr_pihole-data/_data/gravity.db'
   sqlite3 $DB "INSERT OR IGNORE INTO domainlist (type, domain, enabled, comment)
     VALUES (1,'datadome.co',1,'bot-detection');"
   ```
   Type 1 = exact blacklist, type 0 = whitelist, type 3 = regex blacklist.
4. Update gravity to apply: `docker exec pihole pihole -g`

## Verification

```bash
sqlite3 $DB "SELECT COUNT(*) FROM domainlist WHERE type=1;"
# Returns count of blacklisted domains

dig @10.10.0.1 datadome.co +short +timeout=5
# Returns 0.0.0.0 if blocked correctly
```
