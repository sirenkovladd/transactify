# Migrate to bbolt

Operator runbook for cutting over from PostgreSQL to the embedded bbolt store.

## 1. Pre-flight

Stop the running `server` container so writes do not land in postgres during the dump:

```bash
docker compose stop server
```

Back up the `db_data` volume so the postgres source is recoverable if anything goes wrong:

```bash
docker run --rm -v transactify_db_data:/from -v $(pwd):/to \
    alpine cp -a /from /to/pg-backup-$(date +%F)
```

## 2. Run the migrator

The `cli/migrate` tool copies all data from the live PostgreSQL instance into a fresh bbolt file inside a single `db.Update(...)` transaction, so the load is atomic.

```bash
mise run migrate
```

This uses the `cli/migrate` binary with the env-configured `POSTGRES_DSN` and `BBOLT_PATH`. Defaults to `./data/transaction.db` if `BBOLT_PATH` is unset. The script refuses to overwrite an existing bbolt file; remove it first or pass `--bbolt` with a new path.

## 3. Verify counts

Confirm the dumped and loaded row counts match before pointing the server at the new file:

```bash
# bbolt side
bbolt keys data/transaction.db users | wc -l
bbolt keys data/transaction.db transactions | wc -l
bbolt keys data/transaction.db tags | wc -l
bbolt keys data/transaction.db txn_photos | wc -l
bbolt keys data/transaction.db sharing_tokens | wc -l
bbolt keys data/transaction.db user_connections | wc -l
bbolt keys data/transaction.db sessions | wc -l
bbolt keys data/transaction.db settings | wc -l

# postgres side
psql -c "SELECT count(*) FROM users"
psql -c "SELECT count(*) FROM transactions"
psql -c "SELECT count(*) FROM tags"
psql -c "SELECT count(*) FROM transaction_photos"
psql -c "SELECT count(*) FROM sharing_tokens"
psql -c "SELECT count(*) FROM user_connections"
psql -c "SELECT count(*) FROM sessions"
psql -c "SELECT count(*) FROM settings"
```

Every pair must agree. The script also runs a built-in count check on the eight primary buckets and exits non-zero on mismatch.

## 4. Switch deployment

Pull the new image and bring the stack back up. The compose file no longer starts a `db` service:

```bash
git pull
docker compose pull
docker compose up -d
```

The `server` service mounts `./data:/app/data` and sets `BBOLT_PATH=/app/data/transaction.db`, so the file written in step 2 is the new source of truth.

## 5. Smoke test

Hit the API to confirm the most common user paths still work end-to-end:

1. Log in (`POST /api/login`) — must return a session token.
2. List transactions (`GET /api/transactions`) — must respond `200` and the JSON body must match what postgres returned before the cutover.
3. Create a new transaction (`POST /api/transactions/add`) — must respond `201`.
4. Attach a photo (`POST /api/transaction/{id}/photo`) — must respond `200` and the returned URL must serve the uploaded image.
5. Share to a connected user (`POST /api/sharing/connections/add` with a valid token) — must respond `201`.

Any non-2xx response on these paths is a blocker; revert to the postgres image and investigate before retrying.

## 6. Drop pg volume

Only after a full week of clean operation on bbolt, drop the postgres volume:

```bash
docker compose down
docker volume rm transactify_db_data
```

Do not delete the local `pg-backup-*` directory created in step 1 until the volume is gone and the server has been running cleanly for at least one full billing cycle, to give yourself a recovery path if a delayed bug surfaces.
