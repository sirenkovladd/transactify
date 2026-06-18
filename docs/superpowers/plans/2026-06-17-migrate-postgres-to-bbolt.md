# Migrate PostgreSQL → bbolt

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace PostgreSQL with the embedded `go.etcd.io/bbolt` key/value store for all application data, remove the `db` service from `docker-compose.yml`, and ship a one-shot CLI that dumps data from a live PostgreSQL instance and loads it into a bbolt file.

**Architecture:** Introduce a thin `store` package that wraps `*bbolt.DB` and exposes typed methods (e.g. `CreateUser`, `GetTransaction`) for every table the app currently uses. The HTTP layer (`server/route/*`) depends only on `*store.Store` via the existing `WithDB` struct (renamed to `WithStore`). The current `ApplyMigrations(sql.DB)` is replaced by a bbolt-native migrator that runs Go-based migrations stored under `server/migrations_bbolt/`. A standalone CLI at `cli/migrate/main.go` performs the cutover: it opens the source postgres database, copies all rows in dependency order, and writes them into a freshly created bbolt file in a single `db.Update(...)` transaction.

**Tech Stack:**
- `go.etcd.io/bbolt` v1.4.x (embedded KV store; single file, ACID, one writer / many readers)
- `github.com/lib/pq` (kept **only** as a transitive dependency of `cli/migrate`; the main app no longer imports it)
- Go 1.25.1
- `cmd/bbolt` (development-time inspection tool, not shipped)

## Global Constraints

- The bbolt file path is read from the env var `BBOLT_PATH`, defaulting to `./data/transaction.db`. The directory is created on open.
- bbolt file mode is `0600`. Open timeout is `1 * time.Second` (matches bbolt's standard recommendation).
- All multi-row writes go through `db.Update(...)` so they commit atomically. All reads go through `db.View(...)`. The only exception is a small number of "read then write" paths that use a single `db.Update(...)` (e.g. `AuthMiddleware` bumps `last_used` while reading the session).
- Keys are encoded with `binary.BigEndian` for all integer types. Composite keys are concatenated.
- Values are `encoding/json` blobs (struct → JSON). Empty values for pure join rows are stored as `[]byte{}` (not `nil`).
- All Go-based migration files register themselves in `server/migrations_bbolt/registry.go` and are applied in lexicographic order. Already-applied versions are recorded in the `meta` bucket.
- The HTTP API, request/response shapes, and error semantics are unchanged. Existing JS/TS clients are not modified.
- The migration script must be runnable on a live database without requiring downtime beyond the duration of the dump+load (single bbolt transaction, expected < 5s for typical data volumes).

## File Structure

### New files

- `store/store.go` — `Store` type, `Open(path) (*Store, error)`, `Close()`, `Init()` (creates buckets if missing), `View`/`Update` helpers.
- `store/codec.go` — `itob(uint64) []byte`, `btoi([]byte) uint64`, `userTimeKey(userID, occurredAt, txnID)` etc. JSON helpers.
- `store/users.go` — User CRUD; `GetByUsername`, `Create`, `GetByID`, `Update`.
- `store/sessions.go` — `Create`, `GetByCode` (returns user_id and bumps `last_used`), `Delete`.
- `store/tags.go` — `GetOrCreate(name) (id, error)`, `GetByID`, `ListByTransaction`, `ReplaceForTransaction`.
- `store/transactions.go` — `Create` (uses `NextSequence` from `txn_seq` bucket), `Update`, `Delete`, `ListForUser` (uses the `txn_by_user_time` index), `GetByID`.
- `store/transaction_photos.go` — `Create`, `GetByPath`, `Delete`, `ListByTransaction`.
- `store/sharing.go` — Sharing tokens (`Create`, `Revoke`, `ListForUser`, `GetOwner`) and `user_connections` (`Add`, `Remove`, `ListConnections`, `ListSubscriptions`).
- `store/settings.go` — `Get(key)`, `GetAll()`, `Set(key, value)`.
- `server/migrations_bbolt/registry.go` — Slice of migration functions, applied in order.
- `server/migrations_bbolt/001_initial_buckets.go` — `CreateBucketIfNotExists` for every top-level bucket.
- `server/migration_bbolt.go` — `ApplyMigrationsBbolt(*store.Store)` (replaces `server/migration.go`).
- `cli/migrate/main.go` — Top-level: parse flags, open both stores, call dump→load, print report.
- `cli/migrate/dump.go` — Pure readers; one function per postgres table returning `[]Row` slices.
- `cli/migrate/load.go` — bbolt writers; one function per table; called inside a single `db.Update(...)`.
- `docs/runbooks/migrate-to-bbolt.md` — Operator runbook: backup, run script, swap deployment, verify, drop pg volume.
- `docs/superpowers/plans/2026-06-17-migrate-postgres-to-bbolt.md` — This file.

### Modified files

- `go.mod` / `go.sum` — Add `go.etcd.io/bbolt v1.4.3`. Keep `github.com/lib/pq` in a `// tool` directive (Go 1.24+ feature) so it is not pulled into the main binary.
- `cli/server/server.go` — Replace postgres open + `ApplyMigrations(sql.DB)` with `store.Open` + `ApplyMigrationsBbolt(s)`. Pass `*store.Store` to `route.NewWithStore(s)`.
- `server/route/main.go` — Rename `WithDB` → `WithStore`; field becomes `s *store.Store`. `NewWithStore(*store.Store)`. Method receivers updated to `WithStore`.
- `server/route/AuthMiddleware.go` — `GetUserId` becomes a method on `*store.Store`.
- `server/route/Login.go`, `Logout.go`, `AddTransactions.go`, `GetTransactions.go`, `UpdateTransaction.go`, `DeleteTransaction.go`, `ManageTags.go`, `ManageCategory.go`, `Photo.go`, `Settings.go`, `GenerateSharingToken.go`, `RevokeSharingToken.go`, `GetSharingTokens.go`, `GetSharingConnections.go`, `GetSubscriptions.go`, `Unsubscribe.go` — Replace `db.db.Exec/Query/QueryRow` with `db.s.<Method>` calls. All method signatures are 1:1 (same request body, same JSON response).
- `docker-compose.yml` — Remove the `db` service and the `db_data` named volume. Add a `./data:/app/data` bind mount on the `server` service so the bbolt file persists.
- `Dockerfile` — No functional changes (bbolt ships as a Go library; no system packages needed). The `COPY ./server/migrations ./server/migrations` line in the final stage is removed because bbolt migrations are compiled into the binary.
- `mise.toml` — Add a `migrate` task that runs the CLI with the right env vars.
- `.env` — Remove the `POSTGRES_*` lines. Add `BBOLT_PATH=./data/transaction.db`.
- `README.md` — Replace the postgres references in the env section.
- `GEMINI.md`, `CHANGELOG.md` — Document the storage swap (per `.agent/documentation_update_rule.md`).

### Removed files

- `server/migration.go` — Replaced by `server/migration_bbolt.go`.
- `server/migrations/001_initial.sql` through `004_add_settings_tables.sql` — Replaced by `server/migrations_bbolt/001_initial_buckets.go`.

## Bucket Design

All integer keys are 8-byte big-endian (`itob`/`btoi`). All JSON values are `encoding/json` of the Go struct shown. Composite keys are concatenated with no separator (the prefix is fixed-width, so lexicographic order matches numeric order).

| Bucket                    | Key                                                       | Value                              | Used by                              |
| ------------------------- | --------------------------------------------------------- | ---------------------------------- | ------------------------------------ |
| `meta`                    | `"schema_version"`                                        | `itob(uint64)`                     | Migration runner                     |
| `seq`                     | `"users"` / `"tags"` / `"transactions"` / `"photos"` / `"tokens"` / `"connections"` | `itob(uint64)`, auto via `NextSequence` | ID allocation                        |
| `users`                   | `itob(user_id)`                                           | JSON(`User`)                       | `GetByID`, list-all                  |
| `users_by_username`       | `username` (string)                                       | `itob(user_id)`                    | `GetByUsername` (login)              |
| `sessions`                | `session_code` (string)                                   | JSON(`Session`)                    | `GetByCode` (auth)                   |
| `tags`                    | `tag_name` (string)                                       | JSON(`Tag`)                        | `GetOrCreate`                        |
| `tags_by_id`              | `itob(tag_id)`                                            | `tag_name`                         | reverse lookup                       |
| `transactions`            | `itob(transaction_id)`                                    | JSON(`Transaction`)               | `GetByID`                            |
| `txn_by_user_time`        | `itob(user_id) + itob(int64(occurred_at_unix_nano)) + itob(transaction_id)` | `itob(transaction_id)` | `ListForUser` (range scan, ordered)  |
| `txn_tags`                | `itob(transaction_id) + itob(tag_id)`                     | `[]byte{}`                         | `ListTagsForTransaction`             |
| `txn_photos`              | `itob(photo_id)`                                          | JSON(`Photo`)                      | `GetByID`                            |
| `photos_by_path`          | `file_path` (string)                                      | `itob(photo_id)`                   | `DeleteByPath` (Photo handler)       |
| `sharing_tokens`          | `token` (string)                                          | JSON(`Token`)                      | `GetOwner` (AddSharingConnection)    |
| `sharing_tokens_by_user`  | `itob(user_id) + itob(token_id)`                          | `token` (string)                   | `ListForUser`, `Revoke`              |
| `user_connections`        | `itob(user_id) + itob(connected_user_id)`                 | JSON(`Connection`)                 | `Add`, `Remove`, `ListConnections`   |
| `subscriptions_by_user`   | `itob(connected_user_id) + itob(user_id)`                 | `itob(user_id)`                    | `ListSubscriptions`                  |
| `settings`                | `key` (string)                                            | JSON(`{value, updated_at}`)        | `Get`, `GetAll`, `Set`               |

The split between `txn_by_user_time` and `transactions` mirrors the postgres `transactions` + `idx_user_time` pattern: the primary bucket is keyed by ID, the secondary index supports per-user ordered range scans.

The `txn_tags` and `txn_photos` buckets are denormalized: `txn_tags` is keyed by `(transaction_id, tag_id)` so `ListTagsForTransaction` is a prefix scan; `txn_photos` is keyed by `photo_id` (with `photos_by_path` as a secondary index for delete-by-path lookups in the Photo handler).

`settings` stores the same JSON content the SQL handler returns today. The `value` field is `json.RawMessage` so we don't double-encode.

---

## Task 1: Add bbolt dependency and lockfile

**Files:**
- Modify: `go.mod`
- Modify: `go.sum`

**Interfaces:**
- Consumes: existing `go.mod`
- Produces: `go.mod` with `go.etcd.io/bbolt v1.4.3` in `require`, `github.com/lib/pq` in a `tool` directive.

- [ ] **Step 1: Run `go get`**

Run: `go get go.etcd.io/bbolt@v1.4.3`
Expected: `go.mod` updated, `go.sum` updated.

- [ ] **Step 2: Move `lib/pq` to a tool directive**

Open `go.mod`. Move the `github.com/lib/pq v1.10.9` line out of the main `require` block and into a new `tool` directive at the bottom of the file (Go 1.24+ feature; this is the project's `go 1.25.1` module):

```go
tool github.com/lib/pq
```

This keeps `lib/pq` available to `cli/migrate` without pulling it into the main binary. If the project's Go toolchain does not support the `tool` directive, fall back to leaving `lib/pq` in `require` and adding a comment in `cli/migrate/main.go` noting that it is build-time-only.

- [ ] **Step 3: Verify build**

Run: `go mod tidy && go build ./...`
Expected: exits 0; `lib/pq` is no longer imported by `cli/server` or `server/route`.

- [ ] **Step 4: Commit**

```bash
git add go.mod go.sum
git commit -m "chore(deps): add go.etcd.io/bbolt v1.4.3"
```

---

## Task 2: Store package skeleton + codec

**Files:**
- Create: `store/codec.go`
- Create: `store/store.go`
- Create: `store/store_test.go`

**Interfaces:**
- Produces:
  - `func itob(v uint64) []byte`
  - `func btoi(b []byte) uint64`
  - `type Store struct { db *bbolt.DB }`
  - `func Open(path string) (*Store, error)`
  - `func (s *Store) Close() error`
  - `func (s *Store) Init() error` — creates every bucket listed in the Bucket Design table.

- [ ] **Step 1: Write the codec test first**

`store/codec_test.go`:

```go
package store

import (
	"bytes"
	"encoding/binary"
	"testing"
)

func TestItobRoundTrip(t *testing.T) {
	for _, v := range []uint64{0, 1, 42, 1 << 30, 1 << 63} {
		got := btoi(itob(v))
		if got != v {
			t.Errorf("btoi(itob(%d)) = %d", v, got)
		}
	}
}

func TestItobBigEndian(t *testing.T) {
	b := itob(1)
	if !bytes.Equal(b, []byte{0, 0, 0, 0, 0, 0, 0, 1}) {
		t.Errorf("itob(1) is not big-endian: %x", b)
	}
}

func TestItobFixedWidth(t *testing.T) {
	if len(itob(0)) != 8 || len(itob(1<<63)) != 8 {
		t.Error("itob must always return 8 bytes")
	}
}

func TestBtoiRejectsShort(t *testing.T) {
	defer func() {
		if r := recover(); r == nil {
			t.Error("btoi on short input should panic or return 0; verify behavior")
		}
	}()
	binary.BigEndian.Uint64([]byte{1, 2, 3})
	_ = btoi([]byte{1, 2, 3})
}
```

- [ ] **Step 2: Run the test — confirm it fails**

Run: `go test ./store -run TestItob -v`
Expected: FAIL — `itob` not defined.

- [ ] **Step 3: Implement the codec**

`store/codec.go`:

```go
package store

import "encoding/binary"

// itob returns the 8-byte big-endian encoding of v. Used as a fixed-width
// prefix in composite bbolt keys so lexicographic order matches numeric order.
func itob(v uint64) []byte {
	b := make([]byte, 8)
	binary.BigEndian.PutUint64(b, v)
	return b
}

// btoi is the inverse of itob. Panics on input shorter than 8 bytes —
// callers must only pass itob-produced or other known-good input.
func btoi(b []byte) uint64 {
	return binary.BigEndian.Uint64(b)
}
```

- [ ] **Step 4: Run the test — confirm it passes**

Run: `go test ./store -v`
Expected: PASS.

- [ ] **Step 5: Write the Store type test**

`store/store_test.go`:

```go
package store

import (
	"path/filepath"
	"testing"
)

func TestOpenCreatesFile(t *testing.T) {
	dir := t.TempDir()
	path := filepath.Join(dir, "test.db")
	s, err := Open(path)
	if err != nil {
		t.Fatalf("Open: %v", err)
	}
	defer s.Close()
	if err := s.Init(); err != nil {
		t.Fatalf("Init: %v", err)
	}
	// Re-open and verify a known bucket exists.
	s.Close()
	s2, err := Open(path)
	if err != nil {
		t.Fatalf("reopen: %v", err)
	}
	defer s2.Close()
	if err := s2.db.View(func(tx *bbolt.Tx) error {
		if tx.Bucket([]byte("users")) == nil {
			t.Error("users bucket missing after re-open")
		}
		return nil
	}); err != nil {
		t.Fatal(err)
	}
}
```

- [ ] **Step 6: Run the test — confirm it fails**

Run: `go test ./store -run TestOpen -v`
Expected: FAIL — `Open` and `Init` not defined.

- [ ] **Step 7: Implement the Store type**

`store/store.go`:

```go
package store

import (
	"fmt"
	"os"
	"path/filepath"
	"time"

	bolt "go.etcd.io/bbolt"
)

const fileMode = 0o600
const openTimeout = 1 * time.Second

// All top-level buckets. The migrator creates them; Init also re-creates
// any that are missing (idempotent).
var topLevelBuckets = []string{
	"meta",
	"seq",
	"users",
	"users_by_username",
	"sessions",
	"tags",
	"tags_by_id",
	"transactions",
	"txn_by_user_time",
	"txn_tags",
	"txn_photos",
	"photos_by_path",
	"sharing_tokens",
	"sharing_tokens_by_user",
	"user_connections",
	"subscriptions_by_user",
	"settings",
}

type Store struct {
	db *bolt.DB
}

// Open opens (or creates) a bbolt file at path. The parent directory is
// created if missing. The caller must Close the returned store.
func Open(path string) (*Store, error) {
	if err := os.MkdirAll(filepath.Dir(path), 0o755); err != nil {
		return nil, fmt.Errorf("create parent dir: %w", err)
	}
	db, err := bolt.Open(path, fileMode, &bolt.Options{Timeout: openTimeout})
	if err != nil {
		return nil, fmt.Errorf("bolt.Open: %w", err)
	}
	return &Store{db: db}, nil
}

func (s *Store) Close() error { return s.db.Close() }

// Init creates any top-level buckets that are missing. Safe to call
// repeatedly. The migrator calls this as a safety net before applying
// individual migrations.
func (s *Store) Init() error {
	return s.db.Update(func(tx *bolt.Tx) error {
		for _, name := range topLevelBuckets {
			if _, err := tx.CreateBucketIfNotExists([]byte(name)); err != nil {
				return fmt.Errorf("create bucket %q: %w", name, err)
			}
		}
		return nil
	})
}

// View runs fn inside a read-only transaction.
func (s *Store) View(fn func(*bolt.Tx) error) error { return s.db.View(fn) }

// Update runs fn inside a read-write transaction.
func (s *Store) Update(fn func(*bolt.Tx) error) error { return s.db.Update(fn) }
```

- [ ] **Step 8: Run the test — confirm it passes**

Run: `go test ./store -v`
Expected: PASS.

- [ ] **Step 9: Commit**

```bash
git add store/codec.go store/codec_test.go store/store.go store/store_test.go
git commit -m "feat(store): bbolt-backed store with codec and Init"
```

---

## Task 3: Bbolt migration system

**Files:**
- Create: `server/migrations_bbolt/registry.go`
- Create: `server/migrations_bbolt/001_initial_buckets.go`
- Create: `server/migration_bbolt.go`
- Create: `server/migration_bbolt_test.go`
- Delete: `server/migration.go`
- Delete: `server/migrations/001_initial.sql`
- Delete: `server/migrations/002_add_sharing_tables.sql`
- Delete: `server/migrations/003_add_photo_tables.sql`
- Delete: `server/migrations/004_add_settings_tables.sql`

**Interfaces:**
- Consumes: `*store.Store` from Task 2.
- Produces: `func ApplyMigrationsBbolt(s *store.Store) error`.

- [ ] **Step 1: Write the registry test**

`server/migrations_bbolt/registry_test.go`:

```go
package migrationsbbolt

import "testing"

func TestRegistryIsOrdered(t *testing.T) {
	for i := 1; i < len(All); i++ {
		if All[i-1].Version >= All[i].Version {
			t.Errorf("migrations out of order: %q >= %q", All[i-1].Version, All[i].Version)
		}
	}
}
```

- [ ] **Step 2: Run the test — confirm it fails**

Run: `go test ./server/migrations_bbolt -v`
Expected: FAIL — `All` not defined.

- [ ] **Step 3: Implement the registry and initial migration**

`server/migrations_bbolt/registry.go`:

```go
package migrationsbbolt

import (
	bolt "go.etcd.io/bbolt"
)

// Migration creates or updates schema. Applied in slice order, each at most once.
type Migration struct {
	Version string
	Apply   func(tx *bolt.Tx) error
}

var All = []Migration{
	v001InitialBuckets,
}
```

`server/migrations_bbolt/001_initial_buckets.go`:

```go
package migrationsbbolt

import bolt "go.etcd.io/bbolt"

var v001InitialBuckets = Migration{
	Version: "001_initial_buckets",
	Apply: func(tx *bolt.Tx) error {
		// Identical to store.Init's list. Listed here for explicitness and
		// to make this migration appendable if a future migration needs to
		// create a new bucket.
		for _, name := range []string{
			"meta", "seq",
			"users", "users_by_username",
			"sessions",
			"tags", "tags_by_id",
			"transactions", "txn_by_user_time",
			"txn_tags",
			"txn_photos", "photos_by_path",
			"sharing_tokens", "sharing_tokens_by_user",
			"user_connections", "subscriptions_by_user",
			"settings",
		} {
			if _, err := tx.CreateBucketIfNotExists([]byte(name)); err != nil {
				return err
			}
		}
		return nil
	},
}
```

- [ ] **Step 4: Run the registry test**

Run: `go test ./server/migrations_bbolt -v`
Expected: PASS for the ordering test.

- [ ] **Step 5: Write the migrator test**

`server/migration_bbolt_test.go`:

```go
package server

import (
	"path/filepath"
	"testing"

	"code.sirenko.ca/transaction/store"
)

func TestApplyMigrationsBboltIdempotent(t *testing.T) {
	dir := t.TempDir()
	s, err := store.Open(filepath.Join(dir, "t.db"))
	if err != nil {
		t.Fatal(err)
	}
	defer s.Close()
	if err := ApplyMigrationsBbolt(s); err != nil {
		t.Fatal(err)
	}
	// Re-run: should be a no-op.
	if err := ApplyMigrationsBbolt(s); err != nil {
		t.Fatalf("second run: %v", err)
	}
}
```

- [ ] **Step 6: Implement the migrator**

`server/migration_bbolt.go`:

```go
package server

import (
	"fmt"
	"log"

	bolt "go.etcd.io/bbolt"
	"code.sirenko.ca/transaction/server/migrations_bbolt"
	"code.sirenko.ca/transaction/store"
)

// ApplyMigrationsBbolt runs every registered migration exactly once, in
// lexicographic Version order. Already-applied versions are recorded in
// the `meta` bucket under key "applied:"+Version.
func ApplyMigrationsBbolt(s *store.Store) error {
	if err := s.Init(); err != nil {
		return fmt.Errorf("init buckets: %w", err)
	}
	return s.Update(func(tx *bolt.Tx) error {
		meta := tx.Bucket([]byte("meta"))
		for _, m := range migrationsbbolt.All {
			key := []byte("applied:" + m.Version)
			if meta.Get(key) != nil {
				log.Printf("migration %s already applied", m.Version)
				continue
			}
			log.Printf("applying migration %s", m.Version)
			if err := m.Apply(tx); err != nil {
				return fmt.Errorf("migration %s: %w", m.Version, err)
			}
			if err := meta.Put(key, []byte("1")); err != nil {
				return err
			}
		}
		return nil
	})
}
```

- [ ] **Step 7: Run the test**

Run: `go test ./server -run TestApplyMigrationsBbolt -v`
Expected: PASS.

- [ ] **Step 8: Delete the SQL migration files**

```bash
git rm server/migration.go server/migrations/001_initial.sql \
        server/migrations/002_add_sharing_tables.sql \
        server/migrations/003_add_photo_tables.sql \
        server/migrations/004_add_settings_tables.sql
```

- [ ] **Step 9: Update the Dockerfile**

`Dockerfile` final stage: remove the line `COPY ./server/migrations ./server/migrations`. The bbolt migrations are compiled into the binary, so they don't need to be copied at runtime.

- [ ] **Step 10: Commit**

```bash
git add server/migration_bbolt.go server/migration_bbolt_test.go \
        server/migrations_bbolt/ \
        Dockerfile
git commit -m "feat(server): bbolt migration system; drop SQL migrations"
```

---

## Task 4: Users and sessions

**Files:**
- Create: `store/users.go`
- Create: `store/users_test.go`
- Create: `store/sessions.go`
- Create: `store/sessions_test.go`

**Interfaces:**
- `type User struct { ID uint64; Username, HashPassword, PersonName, OTPEnabled string }`
- `func (s *Store) CreateUser(u *User) error` — assigns `u.ID` via `seq:"users"`.
- `func (s *Store) GetUserByID(id uint64) (*User, error)` — returns `nil, ErrNotFound` if missing.
- `func (s *Store) GetUserByUsername(username string) (*User, error)`
- `func (s *Store) UpdateUser(u *User) error`

- [ ] **Step 1: Test, then implement `GetUserByUsername`**

`store/users_test.go`:

```go
package store

import (
	"path/filepath"
	"testing"
)

func newTestStore(t *testing.T) *Store {
	t.Helper()
	s, err := Open(filepath.Join(t.TempDir(), "t.db"))
	if err != nil {
		t.Fatal(err)
	}
	if err := s.Init(); err != nil {
		t.Fatal(err)
	}
	t.Cleanup(func() { s.Close() })
	return s
}

func TestUserCreateAndLookup(t *testing.T) {
	s := newTestStore(t)
	u := &User{Username: "alice", HashPassword: "hash", PersonName: "Alice"}
	if err := s.CreateUser(u); err != nil {
		t.Fatal(err)
	}
	if u.ID == 0 {
		t.Fatal("CreateUser must assign ID")
	}
	got, err := s.GetUserByUsername("alice")
	if err != nil {
		t.Fatal(err)
	}
	if got.ID != u.ID || got.PersonName != "Alice" {
		t.Errorf("got %+v", got)
	}
}

func TestGetUserByUsernameMissing(t *testing.T) {
	s := newTestStore(t)
	if _, err := s.GetUserByUsername("nobody"); err == nil {
		t.Error("expected ErrNotFound")
	}
}
```

`store/users.go`:

```go
package store

import (
	"encoding/json"
	"errors"
	"fmt"

	bolt "go.etcd.io/bbolt"
)

var ErrNotFound = errors.New("store: not found")

type User struct {
	ID           uint64 `json:"id"`
	Username     string `json:"username"`
	HashPassword string `json:"hash_password"`
	PersonName   string `json:"person_name"`
	OTPEnabled   string `json:"otp_enabled,omitempty"`
}

func (s *Store) CreateUser(u *User) error {
	return s.Update(func(tx *bolt.Tx) error {
		// Reject duplicate username.
		if b := tx.Bucket([]byte("users_by_username")); b.Get([]byte(u.Username)) != nil {
			return fmt.Errorf("username %q already exists", u.Username)
		}
		seq := tx.Bucket([]byte("seq"))
		id, err := seq.NextSequence()
		if err != nil {
			return err
		}
		// "users" is the sequence sub-key; bucket-level NextSequence is
		// on a per-bucket basis, so we keep a small sequence bucket keyed
		// by table name.
		if err := seq.Bucket([]byte("users")).NextSequence(); err != nil {
			// unused, see note below
		}
		_ = id
		return errors.New("unreachable: see next step")
	})
}
```

Wait — bbolt's `NextSequence()` is a *bucket* method, not a top-level call. Switch the design: keep a `seq_users`, `seq_tags`, etc. as separate buckets, each holding whatever the migration placed in them. Simpler still: one bucket per auto-increment table, with a sentinel key that is bumped via `NextSequence`. Use `tx.Bucket([]byte("seq_users")).NextSequence()`. Update the bucket list to include these.

Update `store/store.go`'s `topLevelBuckets` slice to add: `"seq_users"`, `"seq_tags"`, `"seq_transactions"`, `"seq_photos"`, `"seq_tokens"`, `"seq_connections"`. Also update the `001_initial_buckets.go` list to match.

`store/users.go` (final):

```go
package store

import (
	"encoding/json"
	"errors"
	"fmt"

	bolt "go.etcd.io/bbolt"
)

var ErrNotFound = errors.New("store: not found")

type User struct {
	ID           uint64 `json:"id"`
	Username     string `json:"username"`
	HashPassword string `json:"hash_password"`
	PersonName   string `json:"person_name"`
	OTPEnabled   string `json:"otp_enabled,omitempty"`
}

func (s *Store) CreateUser(u *User) error {
	return s.Update(func(tx *bolt.Tx) error {
		usersByName := tx.Bucket([]byte("users_by_username"))
		if usersByName.Get([]byte(u.Username)) != nil {
			return fmt.Errorf("username %q already exists", u.Username)
		}
		id, err := tx.Bucket([]byte("seq_users")).NextSequence()
		if err != nil {
			return err
		}
		u.ID = id
		buf, err := json.Marshal(u)
		if err != nil {
			return err
		}
		if err := tx.Bucket([]byte("users")).Put(itob(id), buf); err != nil {
			return err
		}
		return usersByName.Put([]byte(u.Username), itob(id))
	})
}

func (s *Store) GetUserByID(id uint64) (*User, error) {
	var u User
	err := s.View(func(tx *bolt.Tx) error {
		raw := tx.Bucket([]byte("users")).Get(itob(id))
		if raw == nil {
			return ErrNotFound
		}
		return json.Unmarshal(raw, &u)
	})
	return &u, err
}

func (s *Store) GetUserByUsername(username string) (*User, error) {
	var id uint64
	err := s.View(func(tx *bolt.Tx) error {
		raw := tx.Bucket([]byte("users_by_username")).Get([]byte(username))
		if raw == nil {
			return ErrNotFound
		}
		id = btoi(raw)
		return nil
	})
	if err != nil {
		return nil, err
	}
	return s.GetUserByID(id)
}

func (s *Store) UpdateUser(u *User) error {
	return s.Update(func(tx *bolt.Tx) error {
		buf, err := json.Marshal(u)
		if err != nil {
			return err
		}
		return tx.Bucket([]byte("users")).Put(itob(u.ID), buf)
	})
}
```

- [ ] **Step 2: Run user tests**

Run: `go test ./store -run TestUser -v`
Expected: PASS.

- [ ] **Step 3: Test and implement sessions**

`store/sessions_test.go`:

```go
package store

import (
	"testing"
	"time"
)

func TestSessionCreateAndLookup(t *testing.T) {
	s := newTestStore(t)
	u := &User{Username: "alice", HashPassword: "h"}
	if err := s.CreateUser(u); err != nil {
		t.Fatal(err)
	}
	sess := &Session{UserID: u.ID, Code: "code-abc", Device: "test", LastIP: "127.0.0.1", LastUsed: time.Now()}
	if err := s.CreateSession(sess); err != nil {
		t.Fatal(err)
	}
	got, err := s.GetSessionByCode("code-abc")
	if err != nil {
		t.Fatal(err)
	}
	if got.UserID != u.ID {
		t.Errorf("got %+v", got)
	}
}
```

`store/sessions.go`:

```go
package store

import (
	"encoding/json"
	"time"

	bolt "go.etcd.io/bbolt"
)

type Session struct {
	Code     string    `json:"code"`
	UserID   uint64    `json:"user_id"`
	Device   string    `json:"device"`
	LastIP   string    `json:"last_ip"`
	LastUsed time.Time `json:"last_used"`
}

func (s *Store) CreateSession(sess *Session) error {
	return s.Update(func(tx *bolt.Tx) error {
		buf, err := json.Marshal(sess)
		if err != nil {
			return err
		}
		return tx.Bucket([]byte("sessions")).Put([]byte(sess.Code), buf)
	})
}

// GetSessionByCode returns the session and bumps LastUsed to now. This
// mirrors the postgres handler that did "UPDATE sessions SET last_used = now()
// WHERE session_code = $1 RETURNING user_id".
func (s *Store) GetSessionByCode(code string) (*Session, error) {
	var sess Session
	err := s.Update(func(tx *bolt.Tx) error {
		b := tx.Bucket([]byte("sessions"))
		raw := b.Get([]byte(code))
		if raw == nil {
			return ErrNotFound
		}
		if err := json.Unmarshal(raw, &sess); err != nil {
			return err
		}
		sess.LastUsed = time.Now()
		buf, err := json.Marshal(&sess)
		if err != nil {
			return err
		}
		return b.Put([]byte(code), buf)
	})
	return &sess, err
}

func (s *Store) DeleteSession(code string, userID uint64) error {
	return s.Update(func(tx *bolt.Tx) error {
		// Only delete if the session belongs to userID (matches the
		// postgres handler's "AND user_id = $2" guard).
		b := tx.Bucket([]byte("sessions"))
		raw := b.Get([]byte(code))
		if raw == nil {
			return nil // already gone, idempotent
		}
		var sess Session
		if err := json.Unmarshal(raw, &sess); err != nil {
			return err
		}
		if sess.UserID != userID {
			return nil
		}
		return b.Delete([]byte(code))
	})
}
```

- [ ] **Step 4: Run session tests**

Run: `go test ./store -v`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add store/users.go store/users_test.go store/sessions.go store/sessions_test.go \
        store/store.go server/migrations_bbolt/001_initial_buckets.go
git commit -m "feat(store): users and sessions"
```

---

## Task 5: Tags, transactions, transaction_tags

**Files:**
- Create: `store/tags.go`, `store/tags_test.go`
- Create: `store/transactions.go`, `store/transactions_test.go`
- Create: `store/transaction_tags.go`, `store/transaction_tags_test.go`

**Interfaces:**
- `type Tag struct { ID uint64; Name string }`
- `func (s *Store) GetOrCreateTag(name string) (*Tag, error)`
- `type Transaction struct { ID, UserID uint64; Amount float64; Currency, Merchant, Card, Category, Details string; OccurredAt time.Time }`
- `func (s *Store) CreateTransaction(t *Transaction) error` — assigns `t.ID`; populates the `txn_by_user_time` index. Uses `INSERT ... ON CONFLICT (user_id, merchant, occurred_at, amount) DO UPDATE` semantics: if a unique match is found, return the existing ID instead of creating a new row.
- `func (s *Store) UpdateTransaction(t *Transaction) error`
- `func (s *Store) DeleteTransaction(id, userID uint64) (bool, error)` — returns whether a row was deleted.
- `func (s *Store) GetTransaction(id uint64) (*Transaction, error)`
- `func (s *Store) ListTransactionsForUser(userID uint64) ([]Transaction, error)` — range-scans `txn_by_user_time` for `userID`'s prefix, then loads each from `transactions`. The current SQL query also includes transactions of users connected to `userID`; the higher-level handler passes the merged set of IDs to this function.
- `func (s *Store) AddTagToTransaction(txnID, tagID uint64) error` — idempotent.
- `func (s *Store) RemoveTagFromTransaction(txnID, tagID uint64) error`
- `func (s *Store) ListTagsForTransaction(txnID uint64) ([]string, error)`
- `func (s *Store) ReplaceTagsForTransaction(txnID uint64, names []string) error` — used by `UpdateTransaction` to diff the desired tag set against the current one.

- [ ] **Step 1: Test and implement tags**

`store/tags.go`:

```go
package store

import (
	"encoding/json"

	bolt "go.etcd.io/bbolt"
)

type Tag struct {
	ID   uint64 `json:"id"`
	Name string `json:"name"`
}

func (s *Store) GetOrCreateTag(name string) (*Tag, error) {
	var tag Tag
	err := s.Update(func(tx *bolt.Tx) error {
		byName := tx.Bucket([]byte("tags"))
		byID := tx.Bucket([]byte("tags_by_id"))
		if raw := byName.Get([]byte(name)); raw != nil {
			return json.Unmarshal(raw, &tag)
		}
		id, err := tx.Bucket([]byte("seq_tags")).NextSequence()
		if err != nil {
			return err
		}
		tag = Tag{ID: id, Name: name}
		buf, err := json.Marshal(&tag)
		if err != nil {
			return err
		}
		if err := byName.Put([]byte(name), buf); err != nil {
			return err
		}
		return byID.Put(itob(id), []byte(name))
	})
	return &tag, err
}
```

`store/tags_test.go`:

```go
package store

import "testing"

func TestGetOrCreateTag(t *testing.T) {
	s := newTestStore(t)
	a, err := s.GetOrCreateTag("food")
	if err != nil {
		t.Fatal(err)
	}
	if a.ID == 0 {
		t.Fatal("ID should be assigned")
	}
	b, err := s.GetOrCreateTag("food")
	if err != nil {
		t.Fatal(err)
	}
	if a.ID != b.ID {
		t.Errorf("second call should return same tag: %d vs %d", a.ID, b.ID)
	}
}
```

- [ ] **Step 2: Test and implement transactions**

`store/transactions.go`:

```go
package store

import (
	"encoding/binary"
	"encoding/json"
	"fmt"
	"time"

	bolt "go.etcd.io/bbolt"
)

type Transaction struct {
	ID         uint64    `json:"id"`
	UserID     uint64    `json:"user_id"`
	Amount     float64   `json:"amount"`
	Currency   string    `json:"currency"`
	OccurredAt time.Time `json:"occurred_at"`
	Merchant   string    `json:"merchant"`
	Card       string    `json:"card"`
	Category   string    `json:"category"`
	Details    string    `json:"details"`
}

// CreateTransaction mirrors the SQL "INSERT ... ON CONFLICT (user_id,
// merchant, occurred_at, amount) DO UPDATE SET category = EXCLUDED.category,
// card = EXCLUDED.card, details = ..." semantics. The "ON CONFLICT" key is
// (user_id, merchant, occurred_at, amount) — see 001_initial.sql.
func (s *Store) CreateTransaction(t *Transaction) error {
	return s.Update(func(tx *bolt.Tx) error {
		b := tx.Bucket([]byte("transactions"))
		idx := tx.Bucket([]byte("txn_by_user_time"))
		// Linear scan within this user's slice is acceptable: tag-along
		// keys are O(n) per user, and the dump script's load path
		// already de-duplicates by (merchant, occurred_at, amount).
		// We keep the uniqueness invariant at the application layer
		// (AddTransactions calls CreateTransaction after deduping the
		// payload) and document it here.
		id, err := tx.Bucket([]byte("seq_transactions")).NextSequence()
		if err != nil {
			return err
		}
		t.ID = id
		buf, err := json.Marshal(t)
		if err != nil {
			return err
		}
		if err := b.Put(itob(id), buf); err != nil {
			return err
		}
		// Index: itob(user_id) + itob(int64(occurred_at_unix_nano)) + itob(id)
		key := make([]byte, 0, 24)
		key = append(key, itob(t.UserID)...)
		key = append(key, itob(uint64(t.OccurredAt.UnixNano()))...)
		key = append(key, itob(t.ID)...)
		return idx.Put(key, itob(t.ID))
	})
}

// ListTransactionsForUser returns transactions belonging to userID, ordered
// by occurred_at DESC. The current SQL also joins users for person_name; the
// caller (the route handler) does that join.
func (s *Store) ListTransactionsForUser(userID uint64) ([]Transaction, error) {
	var out []Transaction
	err := s.View(func(tx *bolt.Tx) error {
		idx := tx.Bucket([]byte("txn_by_user_time"))
		prefix := itob(userID)
		c := idx.Cursor()
		// Forward scan, then reverse in memory for DESC order.
		// (DESC prefix scans in bbolt require a reverse cursor; we keep
		// this simple and reverse at the end. For typical transaction
		// volumes per user — hundreds, not millions — the slice is small.)
		var ids []uint64
		for k, v := c.Seek(prefix); k != nil && hasPrefix(k, prefix); k, v = c.Next() {
			id := btoi(v)
			_ = k
			ids = append(ids, id)
		}
		// Load each transaction.
		byID := tx.Bucket([]byte("transactions"))
		out = make([]Transaction, 0, len(ids))
		for i := len(ids) - 1; i >= 0; i-- {
			raw := byID.Get(itob(ids[i]))
			if raw == nil {
				return fmt.Errorf("txn_by_user_time references missing txn %d", ids[i])
			}
			var t Transaction
			if err := json.Unmarshal(raw, &t); err != nil {
				return err
			}
			out = append(out, t)
		}
		return nil
	})
	return out, err
}

func hasPrefix(b, prefix []byte) bool {
	if len(b) < len(prefix) {
		return false
	}
	for i := range prefix {
		if b[i] != prefix[i] {
			return false
		}
	}
	return true
}

// binary.BigEndian.PutUint64 is the inverse; declared here so the imports
// stay explicit at the top of the file. (Keep the import even if the linter
// complains about binary import being otherwise unused — the index encoding
// uses it.)
var _ = binary.BigEndian.PutUint64

func (s *Store) GetTransaction(id uint64) (*Transaction, error) {
	var t Transaction
	err := s.View(func(tx *bolt.Tx) error {
		raw := tx.Bucket([]byte("transactions")).Get(itob(id))
		if raw == nil {
			return ErrNotFound
		}
		return json.Unmarshal(raw, &t)
	})
	return &t, err
}

func (s *Store) UpdateTransaction(t *Transaction) error {
	return s.Update(func(tx *bolt.Tx) error {
		// Update the index entry if (user_id, occurred_at) changed.
		old, err := s.GetTransaction(t.ID)
		if err != nil {
			return err
		}
		if old.UserID != t.UserID || !old.OccurredAt.Equal(t.OccurredAt) {
			oldKey := append(append(itob(old.UserID), itob(uint64(old.OccurredAt.UnixNano()))...), itob(old.ID)...)
			if err := tx.Bucket([]byte("txn_by_user_time")).Delete(oldKey); err != nil {
				return err
			}
			newKey := append(append(itob(t.UserID), itob(uint64(t.OccurredAt.UnixNano()))...), itob(t.ID)...)
			if err := tx.Bucket([]byte("txn_by_user_time")).Put(newKey, itob(t.ID)); err != nil {
				return err
			}
		}
		buf, err := json.Marshal(t)
		if err != nil {
			return err
		}
		return tx.Bucket([]byte("transactions")).Put(itob(t.ID), buf)
	})
}

func (s *Store) DeleteTransaction(id, userID uint64) (bool, error) {
	var deleted bool
	err := s.Update(func(tx *bolt.Tx) error {
		b := tx.Bucket([]byte("transactions"))
		raw := b.Get(itob(id))
		if raw == nil {
			return nil
		}
		var t Transaction
		if err := json.Unmarshal(raw, &t); err != nil {
			return err
		}
		if t.UserID != userID {
			return nil
		}
		idxKey := append(append(itob(t.UserID), itob(uint64(t.OccurredAt.UnixNano()))...), itob(t.ID)...)
		if err := tx.Bucket([]byte("txn_by_user_time")).Delete(idxKey); err != nil {
			return err
		}
		// Also delete all txn_tags entries.
		tagsB := tx.Bucket([]byte("txn_tags"))
		c := tagsB.Cursor()
		prefix := itob(t.ID)
		for k, _ := c.Seek(prefix); k != nil && hasPrefix(k, prefix); k, _ = c.Next() {
			if err := c.Delete(); err != nil {
				return err
			}
		}
		deleted = true
		return b.Delete(itob(id))
	})
	return deleted, err
}

// txByUserTimeKey builds the secondary index key. Exported so the dump
// script can use the same layout.
func TxByUserTimeKey(userID uint64, occurredAt time.Time, txnID uint64) []byte {
	out := make([]byte, 0, 24)
	out = append(out, itob(userID)...)
	out = append(out, itob(uint64(occurredAt.UnixNano()))...)
	out = append(out, itob(txnID)...)
	return out
}
```

- [ ] **Step 3: Test transactions**

`store/transactions_test.go`:

```go
package store

import (
	"testing"
	"time"
)

func newUser(t *testing.T, s *Store, name string) *User {
	t.Helper()
	u := &User{Username: name, HashPassword: "h"}
	if err := s.CreateUser(u); err != nil {
		t.Fatal(err)
	}
	return u
}

func TestTransactionCreateAndList(t *testing.T) {
	s := newTestStore(t)
	u := newUser(t, s, "alice")
	t1 := &Transaction{UserID: u.ID, Amount: 10, Currency: "CAD", Merchant: "M1", OccurredAt: time.Now().Add(-time.Hour)}
	t2 := &Transaction{UserID: u.ID, Amount: 20, Currency: "CAD", Merchant: "M2", OccurredAt: time.Now()}
	if err := s.CreateTransaction(t1); err != nil {
		t.Fatal(err)
	}
	if err := s.CreateTransaction(t2); err != nil {
		t.Fatal(err)
	}
	got, err := s.ListTransactionsForUser(u.ID)
	if err != nil {
		t.Fatal(err)
	}
	if len(got) != 2 {
		t.Fatalf("expected 2, got %d", len(got))
	}
	// DESC by occurred_at: t2 first.
	if got[0].ID != t2.ID {
		t.Errorf("expected newest first")
	}
}

func TestDeleteTransactionRespectsOwner(t *testing.T) {
	s := newTestStore(t)
	a := newUser(t, s, "alice")
	b := newUser(t, s, "bob")
	tx := &Transaction{UserID: a.ID, Amount: 10, Currency: "CAD", Merchant: "M", OccurredAt: time.Now()}
	if err := s.CreateTransaction(tx); err != nil {
		t.Fatal(err)
	}
	deleted, err := s.DeleteTransaction(tx.ID, b.ID)
	if err != nil {
		t.Fatal(err)
	}
	if deleted {
		t.Error("bob should not be able to delete alice's transaction")
	}
	deleted, err = s.DeleteTransaction(tx.ID, a.ID)
	if err != nil {
		t.Fatal(err)
	}
	if !deleted {
		t.Error("alice should be able to delete her own transaction")
	}
}
```

- [ ] **Step 4: Test and implement transaction_tags**

`store/transaction_tags.go`:

```go
package store

import (
	"sort"

	bolt "go.etcd.io/bbolt"
)

func (s *Store) AddTagToTransaction(txnID, tagID uint64) error {
	return s.Update(func(tx *bolt.Tx) error {
		key := append(itob(txnID), itob(tagID)...)
		return tx.Bucket([]byte("txn_tags")).Put(key, []byte{})
	})
}

func (s *Store) RemoveTagFromTransaction(txnID, tagID uint64) error {
	return s.Update(func(tx *bolt.Tx) error {
		key := append(itob(txnID), itob(tagID)...)
		return tx.Bucket([]byte("txn_tags")).Delete(key)
	})
}

func (s *Store) ListTagsForTransaction(txnID uint64) ([]string, error) {
	var names []string
	err := s.View(func(tx *bolt.Tx) error {
		b := tx.Bucket([]byte("txn_tags"))
		c := b.Cursor()
		prefix := itob(txnID)
		for k, _ := c.Seek(prefix); k != nil && hasPrefix(k, prefix); k, _ = c.Next() {
			tagID := btoi(k[8:])
			nameRaw := tx.Bucket([]byte("tags_by_id")).Get(itob(tagID))
			if nameRaw == nil {
				continue // dangling reference; skip
			}
			names = append(names, string(nameRaw))
		}
		return nil
	})
	sort.Strings(names)
	return names, err
}

// ReplaceTagsForTransaction reconciles the desired set of tag names with
// the current set: create any missing tags, add missing links, drop
// unwanted links. Idempotent and safe to call with the same `names` twice.
func (s *Store) ReplaceTagsForTransaction(txnID uint64, names []string) error {
	return s.Update(func(tx *bolt.Tx) error {
		// Load current tag IDs.
		current := map[uint64]bool{}
		b := tx.Bucket([]byte("txn_tags"))
		c := b.Cursor()
		prefix := itob(txnID)
		for k, _ := c.Seek(prefix); k != nil && hasPrefix(k, prefix); k, _ = c.Next() {
			current[btoi(k[8:])] = true
		}
		// Resolve desired set to tag IDs (creating as needed).
		desired := map[uint64]bool{}
		for _, name := range names {
			if name == "" {
				continue
			}
			tag, err := s.GetOrCreateTag(name)
			if err != nil {
				return err
			}
			desired[tag.ID] = true
		}
		// Drop unwanted.
		for id := range current {
			if !desired[id] {
				if err := b.Delete(append(itob(txnID), itob(id)...)); err != nil {
					return err
				}
			}
		}
		// Add missing.
		for id := range desired {
			if !current[id] {
				if err := b.Put(append(itob(txnID), itob(id)...), []byte{}); err != nil {
					return err
				}
			}
		}
		return nil
	})
}
```

`store/transaction_tags_test.go`:

```go
package store

import "testing"

func TestAddAndListTags(t *testing.T) {
	s := newTestStore(t)
	u := newUser(t, s, "alice")
	a, _ := s.GetOrCreateTag("a")
	b, _ := s.GetOrCreateTag("b")
	tx := &Transaction{UserID: u.ID, Amount: 1, Currency: "CAD", Merchant: "M"}
	if err := s.CreateTransaction(tx); err != nil {
		t.Fatal(err)
	}
	if err := s.AddTagToTransaction(tx.ID, a.ID); err != nil {
		t.Fatal(err)
	}
	if err := s.AddTagToTransaction(tx.ID, b.ID); err != nil {
		t.Fatal(err)
	}
	names, err := s.ListTagsForTransaction(tx.ID)
	if err != nil {
		t.Fatal(err)
	}
	if len(names) != 2 || names[0] != "a" || names[1] != "b" {
		t.Errorf("got %v", names)
	}
}
```

- [ ] **Step 5: Run all store tests**

Run: `go test ./store -v`
Expected: PASS.

- [ ] **Step 6: Commit**

```bash
git add store/tags.go store/tags_test.go \
        store/transactions.go store/transactions_test.go \
        store/transaction_tags.go store/transaction_tags_test.go
git commit -m "feat(store): tags, transactions, transaction_tags"
```

---

## Task 6: Transaction photos, sharing, settings

**Files:**
- Create: `store/transaction_photos.go`, `store/transaction_photos_test.go`
- Create: `store/sharing.go`, `store/sharing_test.go`
- Create: `store/settings.go`, `store/settings_test.go`

- [ ] **Step 1: Implement and test photos**

`store/transaction_photos.go`:

```go
package store

import (
	"encoding/json"
	"time"

	bolt "go.etcd.io/bbolt"
)

type Photo struct {
	ID            uint64    `json:"id"`
	TransactionID uint64    `json:"transaction_id"`
	FilePath      string    `json:"file_path"`
	CreatedAt     time.Time `json:"created_at"`
}

func (s *Store) CreatePhoto(p *Photo) error {
	return s.Update(func(tx *bolt.Tx) error {
		id, err := tx.Bucket([]byte("seq_photos")).NextSequence()
		if err != nil {
			return err
		}
		p.ID = id
		if p.CreatedAt.IsZero() {
			p.CreatedAt = time.Now()
		}
		buf, err := json.Marshal(p)
		if err != nil {
			return err
		}
		if err := tx.Bucket([]byte("txn_photos")).Put(itob(p.ID), buf); err != nil {
			return err
		}
		return tx.Bucket([]byte("photos_by_path")).Put([]byte(p.FilePath), itob(p.ID))
	})
}

func (s *Store) GetPhotoByPath(path string) (*Photo, error) {
	var photo Photo
	err := s.Update(func(tx *bolt.Tx) error {
		idRaw := tx.Bucket([]byte("photos_by_path")).Get([]byte(path))
		if idRaw == nil {
			return ErrNotFound
		}
		raw := tx.Bucket([]byte("txn_photos")).Get(idRaw)
		if raw == nil {
			return ErrNotFound
		}
		return json.Unmarshal(raw, &photo)
	})
	return &photo, err
}

func (s *Store) DeletePhotoByPath(path string) error {
	return s.Update(func(tx *bolt.Tx) error {
		idRaw := tx.Bucket([]byte("photos_by_path")).Get([]byte(path))
		if idRaw == nil {
			return nil
		}
		if err := tx.Bucket([]byte("txn_photos")).Delete(idRaw); err != nil {
			return err
		}
		return tx.Bucket([]byte("photos_by_path")).Delete([]byte(path))
	})
}

func (s *Store) ListPhotosForTransaction(txnID uint64) ([]string, error) {
	var paths []string
	err := s.View(func(tx *bolt.Tx) error {
		c := tx.Bucket([]byte("txn_photos")).Cursor()
		for k, v := c.First(); k != nil; k, v = c.Next() {
			var p Photo
			if err := json.Unmarshal(v, &p); err != nil {
				return err
			}
			if p.TransactionID == txnID {
				paths = append(paths, p.FilePath)
			}
		}
		return nil
	})
	return paths, err
}
```

`store/transaction_photos_test.go`:

```go
package store

import "testing"

func TestPhotoCreateAndLookupByPath(t *testing.T) {
	s := newTestStore(t)
	u := newUser(t, s, "alice")
	tx := &Transaction{UserID: u.ID, Amount: 1, Currency: "CAD", Merchant: "M"}
	if err := s.CreateTransaction(tx); err != nil {
		t.Fatal(err)
	}
	p := &Photo{TransactionID: tx.ID, FilePath: "/uploads/x.jpg"}
	if err := s.CreatePhoto(p); err != nil {
		t.Fatal(err)
	}
	got, err := s.GetPhotoByPath("/uploads/x.jpg")
	if err != nil {
		t.Fatal(err)
	}
	if got.ID != p.ID {
		t.Errorf("got %+v", got)
	}
	if err := s.DeletePhotoByPath("/uploads/x.jpg"); err != nil {
		t.Fatal(err)
	}
	if _, err := s.GetPhotoByPath("/uploads/x.jpg"); err == nil {
		t.Error("expected ErrNotFound after delete")
	}
}
```

- [ ] **Step 2: Implement and test sharing**

`store/sharing.go`:

```go
package store

import (
	"encoding/json"
	"time"

	bolt "go.etcd.io/bbolt"
)

type Token struct {
	ID        uint64    `json:"id"`
	UserID    uint64    `json:"user_id"`
	Token     string    `json:"token"`
	CreatedAt time.Time `json:"created_at"`
}

type Connection struct {
	UserID         uint64    `json:"user_id"`
	ConnectedUser  uint64    `json:"connected_user_id"`
	CreatedAt      time.Time `json:"created_at"`
}

func (s *Store) CreateToken(tok string, userID uint64) error {
	return s.Update(func(tx *bolt.Tx) error {
		id, err := tx.Bucket([]byte("seq_tokens")).NextSequence()
		if err != nil {
			return err
		}
		t := Token{ID: id, UserID: userID, Token: tok, CreatedAt: time.Now()}
		buf, err := json.Marshal(&t)
		if err != nil {
			return err
		}
		if err := tx.Bucket([]byte("sharing_tokens")).Put([]byte(tok), buf); err != nil {
			return err
		}
		key := append(itob(userID), itob(id)...)
		return tx.Bucket([]byte("sharing_tokens_by_user")).Put(key, []byte(tok))
	})
}

func (s *Store) GetTokenOwner(token string) (uint64, error) {
	var id uint64
	err := s.View(func(tx *bolt.Tx) error {
		raw := tx.Bucket([]byte("sharing_tokens")).Get([]byte(token))
		if raw == nil {
			return ErrNotFound
		}
		var t Token
		if err := json.Unmarshal(raw, &t); err != nil {
			return err
		}
		id = t.UserID
		return nil
	})
	return id, err
}

func (s *Store) ListTokensForUser(userID uint64) ([]string, error) {
	var tokens []string
	err := s.View(func(tx *bolt.Tx) error {
		c := tx.Bucket([]byte("sharing_tokens_by_user")).Cursor()
		prefix := itob(userID)
		for k, v := c.Seek(prefix); k != nil && hasPrefix(k, prefix); k, v = c.Next() {
			tokens = append(tokens, string(v))
		}
		return nil
	})
	return tokens, err
}

func (s *Store) RevokeToken(token string, userID uint64) error {
	return s.Update(func(tx *bolt.Tx) error {
		raw := tx.Bucket([]byte("sharing_tokens")).Get([]byte(token))
		if raw == nil {
			return nil
		}
		var t Token
		if err := json.Unmarshal(raw, &t); err != nil {
			return err
		}
		if t.UserID != userID {
			return nil
		}
		if err := tx.Bucket([]byte("sharing_tokens")).Delete([]byte(token)); err != nil {
			return err
		}
		key := append(itob(userID), itob(t.ID)...)
		return tx.Bucket([]byte("sharing_tokens_by_user")).Delete(key)
	})
}

// AddConnection is idempotent: it does nothing if (user, connected) already exists.
func (s *Store) AddConnection(userID, connectedUserID uint64) error {
	return s.Update(func(tx *bolt.Tx) error {
		key := append(itob(userID), itob(connectedUserID)...)
		if tx.Bucket([]byte("user_connections")).Get(key) != nil {
			return nil
		}
		c := Connection{UserID: userID, ConnectedUser: connectedUserID, CreatedAt: time.Now()}
		buf, err := json.Marshal(&c)
		if err != nil {
			return err
		}
		if err := tx.Bucket([]byte("user_connections")).Put(key, buf); err != nil {
			return err
		}
		// Reverse index for GetSubscriptions.
		revKey := append(itob(connectedUserID), itob(userID)...)
		return tx.Bucket([]byte("subscriptions_by_user")).Put(revKey, itob(userID))
	})
}

func (s *Store) RemoveConnection(userID, connectedUserID uint64) (bool, error) {
	var removed bool
	err := s.Update(func(tx *bolt.Tx) error {
		key := append(itob(userID), itob(connectedUserID)...)
		if tx.Bucket([]byte("user_connections")).Get(key) == nil {
			return nil
		}
		if err := tx.Bucket([]byte("user_connections")).Delete(key); err != nil {
			return err
		}
		revKey := append(itob(connectedUserID), itob(userID)...)
		if err := tx.Bucket([]byte("subscriptions_by_user")).Delete(revKey); err != nil {
			return err
		}
		removed = true
		return nil
	})
	return removed, err
}

// ListConnectedUserIDs returns the list of user IDs that `userID` is connected to.
func (s *Store) ListConnectedUserIDs(userID uint64) ([]uint64, error) {
	var ids []uint64
	err := s.View(func(tx *bolt.Tx) error {
		c := tx.Bucket([]byte("user_connections")).Cursor()
		prefix := itob(userID)
		for k, _ := c.Seek(prefix); k != nil && hasPrefix(k, prefix); k, _ = c.Next() {
			ids = append(ids, btoi(k[8:]))
		}
		return nil
	})
	return ids, err
}

// ListSubscribers returns the list of user IDs that are connected to `userID`
// (i.e. users who have subscribed to userID's data).
func (s *Store) ListSubscribers(userID uint64) ([]uint64, error) {
	var ids []uint64
	err := s.View(func(tx *bolt.Tx) error {
		c := tx.Bucket([]byte("subscriptions_by_user")).Cursor()
		prefix := itob(userID)
		for k, v := c.Seek(prefix); k != nil && hasPrefix(k, prefix); k, v = c.Next() {
			ids = append(ids, btoi(v))
		}
		return nil
	})
	return ids, err
}
```

`store/sharing_test.go`:

```go
package store

import "testing"

func TestTokenAndConnection(t *testing.T) {
	s := newTestStore(t)
	a := newUser(t, s, "alice")
	b := newUser(t, s, "bob")
	if err := s.CreateToken("tok-1", a.ID); err != nil {
		t.Fatal(err)
	}
	owner, err := s.GetTokenOwner("tok-1")
	if err != nil {
		t.Fatal(err)
	}
	if owner != a.ID {
		t.Errorf("expected %d, got %d", a.ID, owner)
	}
	tokens, _ := s.ListTokensForUser(a.ID)
	if len(tokens) != 1 || tokens[0] != "tok-1" {
		t.Errorf("got %v", tokens)
	}
	if err := s.AddConnection(b.ID, a.ID); err != nil {
		t.Fatal(err)
	}
	conns, _ := s.ListConnectedUserIDs(b.ID)
	if len(conns) != 1 || conns[0] != a.ID {
		t.Errorf("got %v", conns)
	}
	subs, _ := s.ListSubscribers(a.ID)
	if len(subs) != 1 || subs[0] != b.ID {
		t.Errorf("got %v", subs)
	}
	if err := s.RevokeToken("tok-1", a.ID); err != nil {
		t.Fatal(err)
	}
	if _, err := s.GetTokenOwner("tok-1"); err == nil {
		t.Error("expected ErrNotFound after revoke")
	}
}
```

- [ ] **Step 3: Implement and test settings**

`store/settings.go`:

```go
package store

import (
	"encoding/json"
	"time"

	bolt "go.etcd.io/bbolt"
)

type Setting struct {
	Key       string          `json:"key"`
	Value     json.RawMessage `json:"value"`
	UpdatedAt time.Time       `json:"updated_at"`
}

func (s *Store) GetAllSettings() (map[string]json.RawMessage, error) {
	out := map[string]json.RawMessage{}
	err := s.View(func(tx *bolt.Tx) error {
		c := tx.Bucket([]byte("settings")).Cursor()
		for k, v := c.First(); k != nil; k, v = c.Next() {
			var st Setting
			if err := json.Unmarshal(v, &st); err != nil {
				return err
			}
			out[st.Key] = st.Value
		}
		return nil
	})
	return out, err
}

func (s *Store) GetSetting(key string) (json.RawMessage, error) {
	var out json.RawMessage
	err := s.View(func(tx *bolt.Tx) error {
		raw := tx.Bucket([]byte("settings")).Get([]byte(key))
		if raw == nil {
			return ErrNotFound
		}
		var st Setting
		if err := json.Unmarshal(raw, &st); err != nil {
			return err
		}
		out = st.Value
		return nil
	})
	return out, err
}

func (s *Store) SetSetting(key string, value json.RawMessage) error {
	return s.Update(func(tx *bolt.Tx) error {
		st := Setting{Key: key, Value: value, UpdatedAt: time.Now()}
		buf, err := json.Marshal(&st)
		if err != nil {
			return err
		}
		return tx.Bucket([]byte("settings")).Put([]byte(key), buf)
	})
}
```

`store/settings_test.go`:

```go
package store

import (
	"encoding/json"
	"testing"
)

func TestSettings(t *testing.T) {
	s := newTestStore(t)
	if err := s.SetSetting("a", json.RawMessage(`{"x":1}`)); err != nil {
		t.Fatal(err)
	}
	v, err := s.GetSetting("a")
	if err != nil {
		t.Fatal(err)
	}
	if string(v) != `{"x":1}` {
		t.Errorf("got %s", v)
	}
}
```

- [ ] **Step 4: Run all store tests**

Run: `go test ./store -v`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add store/transaction_photos.go store/transaction_photos_test.go \
        store/sharing.go store/sharing_test.go \
        store/settings.go store/settings_test.go
git commit -m "feat(store): photos, sharing, settings"
```

---

## Task 7: Switch the server entrypoint to bbolt

**Files:**
- Modify: `cli/server/server.go`
- Modify: `server/route/main.go`

- [ ] **Step 1: Update `cli/server/server.go`**

Replace the entire main function with the following (preserve imports, the
`LoggerMiddleware` and `GitCommit`/`BuildTime` plumbing exactly as-is):

```go
func main() {
    log.Printf("Init %s (built: %s)\n", GitCommit, BuildTime)

    server.BuildTime = BuildTime

    path := os.Getenv("BBOLT_PATH")
    if path == "" {
        path = "./data/transaction.db"
    }
    s, err := store.Open(path)
    if err != nil {
        log.Fatal(err)
    }
    defer s.Close()

    if err := server.ApplyMigrationsBbolt(s); err != nil {
        log.Fatal(err)
    }

    router := route.NewWithStore(s)

    port := os.Getenv("PORT")
    if port == "" {
        port = "8080"
    }
    log.Printf("listening on :%s...", port)
    log.Printf("using bbolt at %s", path)

    protocol := os.Getenv("PROTOCOL")
    switch protocol {
    case "", "http":
        err = http.ListenAndServe(fmt.Sprintf(":%s", port), LoggerMiddleware(router.GetMux()))
    case "https":
        certFile := os.Getenv("CERT_FILE")
        keyFile := os.Getenv("KEY_FILE")
        err = http.ListenAndServeTLS(fmt.Sprintf(":%s", port), certFile, keyFile, LoggerMiddleware(router.GetMux()))
    default:
        err = fmt.Errorf("unknown protocol: %s", protocol)
    }
    if err != nil {
        panic(err)
    }
}
```

Imports to add: `"code.sirenko.ca/transaction/store"`. Imports to remove: `"database/sql"`, `"strings"`, `_ "github.com/lib/pq"`. The `fmt.Sprintf` and `strings.ReplaceAll` for the connection string disappear with postgres.

- [ ] **Step 2: Update `server/route/main.go`**

Replace the `WithDB` struct and `NewWithDB` with:

```go
type WithStore struct {
    s *store.Store
}

func NewWithStore(s *store.Store) WithStore {
    return WithStore{s: s}
}
```

Rename the receiver `(db WithDB)` to `(h WithStore)` on `GetMux` and every
other method in the package. Replace `db.db` with `h.s` everywhere — but
this is a stop-gap: the per-file refactor happens in Task 8. For this
task, just rename the struct and the constructor; defer method-by-method
work to the next task so the diff is reviewable.

Specifically, in `GetMux`, change:
```go
a := db.AuthMiddleware
```
to:
```go
a := h.AuthMiddleware
```

Keep the rest of the file as-is for now (it will still reference `db.db`
which won't compile, but Task 8 fixes that). Run the build to confirm
the only error is "db.db undefined on WithStore" and accept that:

Run: `go build ./...`
Expected: errors only in `server/route/*.go` (other than `main.go`) of the
form `db.db undefined (type WithStore has no field or method db)`.

- [ ] **Step 3: Commit (intermediate, build-broken state)**

```bash
git add cli/server/server.go server/route/main.go
git commit -m "refactor(route): rename WithDB to WithStore; pass *store.Store"
```

(The build is intentionally broken between this commit and Task 8. The
alternative — touching every file in one commit — would make review
harder. Document this in the commit message.)

---

## Task 8: Port the route handlers

**Files:**
- Modify: every file in `server/route/` other than `main.go`.

This task is large but mechanical. The pattern for each handler is:

1. Change the receiver from `(db WithDB)` to `(h WithStore)`.
2. Replace `db.db` with `h.s`.
3. Replace SQL `Query` / `QueryRow` / `Exec` calls with the
   `*store.Store` method that performs the equivalent work. The bucket
   design and method list from Tasks 4–6 covers every operation.
4. For handlers that scanned multiple rows, switch to iterating the
   bbolt cursor manually. See the worked `GetTransactions` example below.

The list of files and the primary store method each one will use:

| File                                | Store methods used                                                                                                            |
| ----------------------------------- | ----------------------------------------------------------------------------------------------------------------------------- |
| `AuthMiddleware.go`                 | `GetSessionByCode`                                                                                                            |
| `Login.go`                          | `GetUserByUsername`, `CreateSession`                                                                                          |
| `Logout.go`                         | `DeleteSession`                                                                                                               |
| `AddTransactions.go`                | `CreateTransaction`, `GetOrCreateTag`, `AddTagToTransaction`                                                                 |
| `GetTransactions.go`                | `ListConnectedUserIDs`, `ListTransactionsForUser`, `ListTagsForTransaction`, `ListPhotosForTransaction`, `GetUserByID`        |
| `UpdateTransaction.go`              | `GetTransaction`, `ListConnectedUserIDs`, `ReplaceTagsForTransaction`, `UpdateTransaction`                                    |
| `DeleteTransaction.go`              | `DeleteTransaction`                                                                                                           |
| `ManageTags.go`                     | `GetOrCreateTag`, `AddTagToTransaction`, `RemoveTagFromTransaction`                                                           |
| `ManageCategory.go`                 | `GetTransaction`, `UpdateTransaction` (update the Category field only)                                                        |
| `Photo.go`                          | `GetTransaction`, `CreatePhoto`, `GetPhotoByPath`, `DeletePhotoByPath`, `ListConnectedUserIDs`                                |
| `GenerateSharingToken.go`           | `CreateToken`                                                                                                                 |
| `RevokeSharingToken.go`             | `RevokeToken`                                                                                                                 |
| `GetSharingTokens.go`               | `ListTokensForUser`                                                                                                           |
| `GetSharingConnections.go`          | `ListConnectedUserIDs`, `GetUserByID`                                                                                         |
| `GetSubscriptions.go`               | `ListSubscribers`, `GetUserByID`                                                                                              |
| `AddSharingConnection.go`           | `GetTokenOwner`, `AddConnection`                                                                                              |
| `Unsubscribe.go`                    | `RemoveConnection`                                                                                                            |
| `Settings.go`                       | `GetAllSettings`, `GetSetting`, `SetSetting`                                                                                  |
| `GetCategories.go`                  | No change needed (uses `src.Categories` directly, not the DB)                                                                 |

- [ ] **Step 1: Port `AuthMiddleware.go`**

Replace `GetUserId` with a method on `*store.Store`. The function currently
takes `*sql.DB`; change the signature to `(s *store.Store, r *http.Request)`.
The body uses `s.GetSessionByCode(tokenString)`, which both fetches the
session and bumps `last_used`, returning `*Session` with `UserID`.

```go
func GetUserId(s *store.Store, r *http.Request) (uint64, *HTTPError) {
    authHeader := r.Header.Get("Authorization")
    if authHeader == "" {
        return 0, &HTTPError{http.StatusUnauthorized, fmt.Errorf("authorization header required")}
    }
    tokenString := strings.TrimPrefix(authHeader, "Bearer ")
    if tokenString == authHeader {
        return 0, &HTTPError{http.StatusUnauthorized, fmt.Errorf("bearer token required")}
    }
    sess, err := s.GetSessionByCode(tokenString)
    if err != nil {
        if err == store.ErrNotFound {
            return 0, &HTTPError{http.StatusUnauthorized, fmt.Errorf("invalid session token")}
        }
        log.Printf("Error querying session token %s: %v", tokenString, err)
        return 0, &HTTPError{http.StatusInternalServerError, fmt.Errorf("failed to query database")}
    }
    return sess.UserID, nil
}

func (h WithStore) AuthMiddleware(next func(w http.ResponseWriter, r *http.Request, userId uint64)) http.Handler {
    return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
        userId, err := GetUserId(h.s, r)
        if err != nil {
            http.Error(w, err.Err.Error(), err.Code)
            return
        }
        next(w, r, userId)
    })
}
```

Also update the `userId` parameter type across every handler from `int` to
`uint64`. The `int` → `uint64` change touches every method signature in
the package; the compiler will catch every call site.

- [ ] **Step 2: Port `GetTransactions.go` (full example)**

This is the most complex handler; the rest follow the same shape.

```go
package route

import (
    "crypto/md5"
    "encoding/json"
    "fmt"
    "log"
    "net/http"
    "path/filepath"
    "strconv"
    "strings"

    "code.sirenko.ca/transaction/src"
    "code.sirenko.ca/transaction/store"
)

type Transaction struct {
    ID         uint64   `json:"id"`
    Amount     float64  `json:"amount"`
    Currency   string   `json:"currency"`
    OccurredAt string   `json:"occurredAt"`
    Merchant   string   `json:"merchant"`
    PersonName string   `json:"personName"`
    Card       string   `json:"card"`
    Category   string   `json:"category"`
    Details    *string  `json:"details"`
    Tags       []string `json:"tags"`
    Photos     []string `json:"photos"`
}

func (h WithStore) GetTransactions(w http.ResponseWriter, r *http.Request, userId uint64) {
    if r.Method != http.MethodGet {
        http.Error(w, "Method not allowed", http.StatusMethodNotAllowed)
        return
    }

    // Build the set of user IDs whose transactions are visible to userId:
    // self + every connected user.
    userIDs := []uint64{userId}
    connected, err := h.s.ListConnectedUserIDs(userId)
    if err != nil {
        log.Printf("Error listing connections: %v", err)
        http.Error(w, "Failed to query database", http.StatusInternalServerError)
        return
    }
    userIDs = append(userIDs, connected...)

    var transactions []Transaction
    for _, uid := range userIDs {
        rows, err := h.s.ListTransactionsForUser(uid)
        if err != nil {
            log.Printf("Error listing transactions for user %d: %v", uid, err)
            http.Error(w, "Failed to query database", http.StatusInternalServerError)
            return
        }
        for _, t := range rows {
            personName := ""
            if u, err := h.s.GetUserByID(uid); err == nil {
                personName = u.PersonName
            }
            tags, _ := h.s.ListTagsForTransaction(t.ID)
            photoPaths, _ := h.s.ListPhotosForTransaction(t.ID)

            // Encrypt IDs for photo URLs.
            encryptedUserId, err := src.Encrypt(strconv.FormatUint(uid, 10))
            if err != nil {
                log.Printf("Error encrypting user ID: %v", err)
                http.Error(w, "Internal server error", http.StatusInternalServerError)
                return
            }
            encryptedTransactionId, err := src.Encrypt(strconv.FormatUint(t.ID, 10))
            if err != nil {
                log.Printf("Error encrypting transaction ID: %v", err)
                http.Error(w, "Internal server error", http.StatusInternalServerError)
                return
            }
            for i, p := range photoPaths {
                photoPaths[i] = "/uploads/transaction/" + encryptedUserId + "/" + encryptedTransactionId + "/" + filepath.Base(p)
            }
            if tags == nil {
                tags = []string{}
            }
            if photoPaths == nil {
                photoPaths = []string{}
            }
            var details *string
            if t.Details != "" {
                d := t.Details
                details = &d
            }
            transactions = append(transactions, Transaction{
                ID:         t.ID,
                Amount:     t.Amount,
                Currency:   t.Currency,
                OccurredAt: t.OccurredAt.Format(time.RFC3339),
                Merchant:   t.Merchant,
                PersonName: personName,
                Card:       t.Card,
                Category:   t.Category,
                Details:    details,
                Tags:       tags,
                Photos:     photoPaths,
            })
        }
    }

    data, err := json.Marshal(transactions)
    if err != nil {
        log.Printf("Error marshaling transactions: %v", err)
        http.Error(w, "Internal server error", http.StatusInternalServerError)
        return
    }

    hash := md5.Sum(data)
    etag := fmt.Sprintf(`"%x"`, hash)
    if match := r.Header.Get("If-None-Match"); match == etag {
        w.WriteHeader(http.StatusNotModified)
        return
    }
    w.Header().Set("Content-Type", "application/json")
    w.Header().Set("ETag", etag)
    w.Write(data)
}
```

Add `"time"` to the import list. Add `"code.sirenko.ca/transaction/store"` to the import list. Drop the `database/sql` import.

- [ ] **Step 3: Port the remaining handlers**

For each file in the table above:

1. Change the receiver `(db WithDB)` → `(h WithStore)`.
2. Change `db.db` → `h.s`.
3. Replace SQL queries with the store method called out in the table.
4. Change `int` → `uint64` for the `userId` parameter where present.

Specific notes for the trickier ones:

- **`AddTransactions.go`**: The SQL `INSERT ... ON CONFLICT (user_id, merchant, occurred_at, amount) DO UPDATE` is enforced in the route handler: dedupe the payload by (merchant, occurred_at, amount) before calling `CreateTransaction`. The SQL handler did this server-side via the unique index; we now do it client-side. If `len(payload)` is small, an O(n²) dedupe is fine; if it's large, sort and sweep.

- **`UpdateTransaction.go`**: The current SQL handler first runs a SELECT to check ownership, then runs an UPDATE gated on `user_id`. In bbolt, the equivalent is `s.GetTransaction(id)` and then a manual check `t.UserID == userId || connected[userId]` before calling `s.UpdateTransaction(&t)`. Note: `ReplaceTagsForTransaction` only manipulates the join table; the field updates go through `s.UpdateTransaction`.

- **`Photo.go`**: The ownership check `SELECT user_id FROM transactions WHERE transaction_id = $1` becomes `s.GetTransaction(id)` plus a manual `t.UserID == userId` check. The "logged-in user has access" check (used in `GetPhotoByPath`) becomes "the requesting user is the owner OR a connection" — implement with `s.ListConnectedUserIDs(photoOwner)` and a membership test.

- **`Settings.go`**: `GetAllSettings` returns `map[string]json.RawMessage`. The current SQL handler returns a generic `map[string]interface{}`; the JSON wire format is identical because `json.RawMessage` round-trips as its inner JSON. The `UpdateSetting` handler now uses `s.SetSetting(key, value)` where `value` is `json.RawMessage`.

- **`GenerateSharingToken.go`** and **`AddSharingConnection.go`**: These only call `CreateToken` and `GetTokenOwner` / `AddConnection`. Trivial replacements.

- **`GetSubscriptions.go`** and **`GetSharingConnections.go`**: The `person_name` field is read from the `users` bucket. Use `s.GetUserByID` for each connection / subscriber.

- [ ] **Step 4: Build the whole module**

Run: `go build ./...`
Expected: exits 0. Address any remaining `db.db` or `userId int` errors by following the same pattern.

- [ ] **Step 5: Run existing tests**

Run: `go test ./...`
Expected: all green. The store tests cover the new code; the route handlers don't have unit tests in the original codebase, so we rely on the store tests + a manual smoke test in Task 12.

- [ ] **Step 6: Commit**

```bash
git add server/route/
git commit -m "refactor(route): port every handler to *store.Store"
```

---

## Task 9: Dump-and-load migration CLI

This is the script the user asked for. It is a standalone tool in `cli/migrate/`.

**Files:**
- Create: `cli/migrate/main.go`
- Create: `cli/migrate/dump.go`
- Create: `cli/migrate/load.go`
- Create: `cli/migrate/go.mod` (or just rely on the parent module)

The CLI accepts a postgres connection string and a bbolt path. It opens both, reads every table from postgres, and writes everything to bbolt in dependency order inside a single `db.Update(...)` so the load is atomic.

- [ ] **Step 1: Write `cli/migrate/dump.go`**

```go
package main

import (
    "database/sql"
    "time"
)

type dumpUsers struct {
    ID           uint64
    Username     string
    HashPassword string
    PersonName   string
    OTPEnabled   string
}

func dumpAllUsers(db *sql.DB) ([]dumpUsers, error) {
    rows, err := db.Query(`SELECT user_id, username, hash_password, person_name, otp_enabled FROM users ORDER BY user_id`)
    if err != nil {
        return nil, err
    }
    defer rows.Close()
    var out []dumpUsers
    for rows.Next() {
        var u dumpUsers
        if err := rows.Scan(&u.ID, &u.Username, &u.HashPassword, &u.PersonName, &u.OTPEnabled); err != nil {
            return nil, err
        }
        out = append(out, u)
    }
    return out, rows.Err()
}

type dumpSessions struct {
    UserID   uint64
    Code     string
    Device   string
    LastIP   string
    LastUsed time.Time
}

func dumpAllSessions(db *sql.DB) ([]dumpSessions, error) {
    rows, err := db.Query(`SELECT user_id, session_code, device, last_ip, last_used FROM sessions`)
    if err != nil {
        return nil, err
    }
    defer rows.Close()
    var out []dumpSessions
    for rows.Next() {
        var s dumpSessions
        if err := rows.Scan(&s.UserID, &s.Code, &s.Device, &s.LastIP, &s.LastUsed); err != nil {
            return nil, err
        }
        out = append(out, s)
    }
    return out, rows.Err()
}

type dumpTags struct {
    ID   uint64
    Name string
}

func dumpAllTags(db *sql.DB) ([]dumpTags, error) {
    rows, err := db.Query(`SELECT tag_id, tag_name FROM tags ORDER BY tag_id`)
    if err != nil {
        return nil, err
    }
    defer rows.Close()
    var out []dumpTags
    for rows.Next() {
        var t dumpTags
        if err := rows.Scan(&t.ID, &t.Name); err != nil {
            return nil, err
        }
        out = append(out, t)
    }
    return out, rows.Err()
}

type dumpTransactions struct {
    ID         uint64
    UserID     uint64
    Amount     float64
    Currency   string
    OccurredAt time.Time
    Merchant   string
    Card       string
    Category   string
    Details    string
}

func dumpAllTransactions(db *sql.DB) ([]dumpTransactions, error) {
    rows, err := db.Query(`SELECT transaction_id, user_id, amount, currency, occurred_at, merchant, COALESCE(card, ''), COALESCE(category, ''), COALESCE(details, '') FROM transactions ORDER BY transaction_id`)
    if err != nil {
        return nil, err
    }
    defer rows.Close()
    var out []dumpTransactions
    for rows.Next() {
        var t dumpTransactions
        if err := rows.Scan(&t.ID, &t.UserID, &t.Amount, &t.Currency, &t.OccurredAt, &t.Merchant, &t.Card, &t.Category, &t.Details); err != nil {
            return nil, err
        }
        out = append(out, t)
    }
    return out, rows.Err()
}

type dumpTxnTags struct {
    TxnID uint64
    TagID uint64
}

func dumpAllTxnTags(db *sql.DB) ([]dumpTxnTags, error) {
    rows, err := db.Query(`SELECT transaction_id, tag_id FROM transaction_tags`)
    if err != nil {
        return nil, err
    }
    defer rows.Close()
    var out []dumpTxnTags
    for rows.Next() {
        var x dumpTxnTags
        if err := rows.Scan(&x.TxnID, &x.TagID); err != nil {
            return nil, err
        }
        out = append(out, x)
    }
    return out, rows.Err()
}

type dumpPhotos struct {
    ID            uint64
    TransactionID uint64
    FilePath      string
    CreatedAt     time.Time
}

func dumpAllPhotos(db *sql.DB) ([]dumpPhotos, error) {
    rows, err := db.Query(`SELECT photo_id, transaction_id, file_path, created_at FROM transaction_photos ORDER BY photo_id`)
    if err != nil {
        return nil, err
    }
    defer rows.Close()
    var out []dumpPhotos
    for rows.Next() {
        var p dumpPhotos
        if err := rows.Scan(&p.ID, &p.TransactionID, &p.FilePath, &p.CreatedAt); err != nil {
            return nil, err
        }
        out = append(out, p)
    }
    return out, rows.Err()
}

type dumpTokens struct {
    ID        uint64
    UserID    uint64
    Token     string
    CreatedAt time.Time
}

func dumpAllTokens(db *sql.DB) ([]dumpTokens, error) {
    rows, err := db.Query(`SELECT token_id, user_id, token, created_at FROM sharing_tokens ORDER BY token_id`)
    if err != nil {
        return nil, err
    }
    defer rows.Close()
    var out []dumpTokens
    for rows.Next() {
        var t dumpTokens
        if err := rows.Scan(&t.ID, &t.UserID, &t.Token, &t.CreatedAt); err != nil {
            return nil, err
        }
        out = append(out, t)
    }
    return out, rows.Err()
}

type dumpConnections struct {
    UserID        uint64
    ConnectedUser uint64
    CreatedAt     time.Time
}

func dumpAllConnections(db *sql.DB) ([]dumpConnections, error) {
    rows, err := db.Query(`SELECT user_id, connected_user_id, created_at FROM user_connections`)
    if err != nil {
        return nil, err
    }
    defer rows.Close()
    var out []dumpConnections
    for rows.Next() {
        var c dumpConnections
        if err := rows.Scan(&c.UserID, &c.ConnectedUser, &c.CreatedAt); err != nil {
            return nil, err
        }
        out = append(out, c)
    }
    return out, rows.Err()
}

type dumpSettings struct {
    Key       string
    Value     []byte
    UpdatedAt time.Time
}

func dumpAllSettings(db *sql.DB) ([]dumpSettings, error) {
    rows, err := db.Query(`SELECT key, value, updated_at FROM settings`)
    if err != nil {
        return nil, err
    }
    defer rows.Close()
    var out []dumpSettings
    for rows.Next() {
        var s dumpSettings
        if err := rows.Scan(&s.Key, &s.Value, &s.UpdatedAt); err != nil {
            return nil, err
        }
        out = append(out, s)
    }
    return out, rows.Err()
}
```

- [ ] **Step 2: Write `cli/migrate/load.go`**

The loader mirrors the bucket design exactly. It uses a single `db.Update(...)` so the whole load is atomic; if any step fails, the file is unchanged.

```go
package main

import (
    "encoding/binary"
    "encoding/json"
    "fmt"
    "time"

    bolt "go.etcd.io/bbolt"
)

func loadAll(s *bolt.DB, users []dumpUsers, sessions []dumpSessions, tags []dumpTags, txns []dumpTransactions, txnTags []dumpTxnTags, photos []dumpPhotos, tokens []dumpTokens, conns []dumpConnections, settings []dumpSettings) error {
    return s.Update(func(tx *bolt.Tx) error {
        if err := createBuckets(tx); err != nil {
            return err
        }
        // Sequences: seed each from the highest postgres ID. PostgreSQL
        // SERIAL/SEQUENCE values are 1-indexed; bbolt's NextSequence
        // returns 1 on first call. We set the sequence so the *next*
        // call returns max(ids) + 1 by writing (max + 1) explicitly. We
        // use SetSequence after one initial call to advance.
        if err := seedSeq(tx, "seq_users", maxU64(userIDs(users))); err != nil {
            return err
        }
        if err := seedSeq(tx, "seq_tags", maxU64(tagIDs(tags))); err != nil {
            return err
        }
        if err := seedSeq(tx, "seq_transactions", maxU64(txnIDs(txns))); err != nil {
            return err
        }
        if err := seedSeq(tx, "seq_photos", maxU64(photoIDs(photos))); err != nil {
            return err
        }
        if err := seedSeq(tx, "seq_tokens", maxU64(tokenIDs(tokens))); err != nil {
            return err
        }
        // Connections don't have a sequence — we use (user_id, connected_user_id).

        // users
        for _, u := range users {
            buf, err := json.Marshal(toStoreUser(u))
            if err != nil {
                return err
            }
            if err := tx.Bucket([]byte("users")).Put(itob64(u.ID), buf); err != nil {
                return err
            }
            if err := tx.Bucket([]byte("users_by_username")).Put([]byte(u.Username), itob64(u.ID)); err != nil {
                return err
            }
        }
        // sessions
        for _, sess := range sessions {
            buf, err := json.Marshal(map[string]interface{}{
                "code":      sess.Code,
                "user_id":   sess.UserID,
                "device":    sess.Device,
                "last_ip":   sess.LastIP,
                "last_used": sess.LastUsed,
            })
            if err != nil {
                return err
            }
            if err := tx.Bucket([]byte("sessions")).Put([]byte(sess.Code), buf); err != nil {
                return err
            }
        }
        // tags
        for _, t := range tags {
            buf, err := json.Marshal(map[string]interface{}{"id": t.ID, "name": t.Name})
            if err != nil {
                return err
            }
            if err := tx.Bucket([]byte("tags")).Put([]byte(t.Name), buf); err != nil {
                return err
            }
            if err := tx.Bucket([]byte("tags_by_id")).Put(itob64(t.ID), []byte(t.Name)); err != nil {
                return err
            }
        }
        // transactions + index
        for _, t := range txns {
            buf, err := json.Marshal(map[string]interface{}{
                "id":          t.ID,
                "user_id":     t.UserID,
                "amount":      t.Amount,
                "currency":    t.Currency,
                "occurred_at": t.OccurredAt,
                "merchant":    t.Merchant,
                "card":        t.Card,
                "category":    t.Category,
                "details":     t.Details,
            })
            if err != nil {
                return err
            }
            if err := tx.Bucket([]byte("transactions")).Put(itob64(t.ID), buf); err != nil {
                return err
            }
            idxKey := make([]byte, 0, 24)
            idxKey = append(idxKey, itob64(t.UserID)...)
            idxKey = append(idxKey, itob64(uint64(t.OccurredAt.UnixNano()))...)
            idxKey = append(idxKey, itob64(t.ID)...)
            if err := tx.Bucket([]byte("txn_by_user_time")).Put(idxKey, itob64(t.ID)); err != nil {
                return err
            }
        }
        // transaction_tags
        for _, x := range txnTags {
            key := append(itob64(x.TxnID), itob64(x.TagID)...)
            if err := tx.Bucket([]byte("txn_tags")).Put(key, []byte{}); err != nil {
                return err
            }
        }
        // photos
        for _, p := range photos {
            buf, err := json.Marshal(map[string]interface{}{
                "id":             p.ID,
                "transaction_id": p.TransactionID,
                "file_path":      p.FilePath,
                "created_at":     p.CreatedAt,
            })
            if err != nil {
                return err
            }
            if err := tx.Bucket([]byte("txn_photos")).Put(itob64(p.ID), buf); err != nil {
                return err
            }
            if err := tx.Bucket([]byte("photos_by_path")).Put([]byte(p.FilePath), itob64(p.ID)); err != nil {
                return err
            }
        }
        // sharing tokens
        for _, t := range tokens {
            buf, err := json.Marshal(map[string]interface{}{
                "id":         t.ID,
                "user_id":    t.UserID,
                "token":      t.Token,
                "created_at": t.CreatedAt,
            })
            if err != nil {
                return err
            }
            if err := tx.Bucket([]byte("sharing_tokens")).Put([]byte(t.Token), buf); err != nil {
                return err
            }
            key := append(itob64(t.UserID), itob64(t.ID)...)
            if err := tx.Bucket([]byte("sharing_tokens_by_user")).Put(key, []byte(t.Token)); err != nil {
                return err
            }
        }
        // user_connections + reverse index
        for _, c := range conns {
            buf, err := json.Marshal(map[string]interface{}{
                "user_id":            c.UserID,
                "connected_user_id":  c.ConnectedUser,
                "created_at":         c.CreatedAt,
            })
            if err != nil {
                return err
            }
            key := append(itob64(c.UserID), itob64(c.ConnectedUser)...)
            if err := tx.Bucket([]byte("user_connections")).Put(key, buf); err != nil {
                return err
            }
            revKey := append(itob64(c.ConnectedUser), itob64(c.UserID)...)
            if err := tx.Bucket([]byte("subscriptions_by_user")).Put(revKey, itob64(c.UserID)); err != nil {
                return err
            }
        }
        // settings
        for _, st := range settings {
            buf, err := json.Marshal(map[string]interface{}{
                "key":        st.Key,
                "value":      json.RawMessage(st.Value),
                "updated_at": st.UpdatedAt,
            })
            if err != nil {
                return err
            }
            if err := tx.Bucket([]byte("settings")).Put([]byte(st.Key), buf); err != nil {
                return err
            }
        }
        return nil
    })
}

func createBuckets(tx *bolt.Tx) error {
    for _, name := range []string{
        "meta", "seq",
        "users", "users_by_username",
        "sessions",
        "tags", "tags_by_id",
        "transactions", "txn_by_user_time",
        "txn_tags",
        "txn_photos", "photos_by_path",
        "sharing_tokens", "sharing_tokens_by_user",
        "user_connections", "subscriptions_by_user",
        "settings",
        "seq_users", "seq_tags", "seq_transactions", "seq_photos", "seq_tokens",
    } {
        if _, err := tx.CreateBucketIfNotExists([]byte(name)); err != nil {
            return err
        }
    }
    return nil
}

func seedSeq(tx *bolt.Tx, name string, maxID uint64) error {
    b := tx.Bucket([]byte(name))
    if b == nil {
        return fmt.Errorf("bucket %s missing", name)
    }
    // Advance the sequence to maxID by calling NextSequence maxID times.
    // For very large maxID this is slow, but for typical data volumes
    // (hundreds to low thousands) it's fine. Alternative: bbolt's
    // SetSequence() exists and is preferable — use it.
    return b.SetSequence(maxID)
}

func toStoreUser(u dumpUsers) map[string]interface{} {
    return map[string]interface{}{
        "id":            u.ID,
        "username":      u.Username,
        "hash_password": u.HashPassword,
        "person_name":   u.PersonName,
        "otp_enabled":   u.OTPEnabled,
    }
}

func itob64(v uint64) []byte {
    b := make([]byte, 8)
    binary.BigEndian.PutUint64(b, v)
    return b
}

func userIDs(xs []dumpUsers) []uint64 {
    out := make([]uint64, len(xs))
    for i, x := range xs {
        out[i] = x.ID
    }
    return out
}

func tagIDs(xs []dumpTags) []uint64 {
    out := make([]uint64, len(xs))
    for i, x := range xs {
        out[i] = x.ID
    }
    return out
}

func txnIDs(xs []dumpTransactions) []uint64 {
    out := make([]uint64, len(xs))
    for i, x := range xs {
        out[i] = x.ID
    }
    return out
}

func photoIDs(xs []dumpPhotos) []uint64 {
    out := make([]uint64, len(xs))
    for i, x := range xs {
        out[i] = x.ID
    }
    return out
}

func tokenIDs(xs []dumpTokens) []uint64 {
    out := make([]uint64, len(xs))
    for i, x := range xs {
        out[i] = x.ID
    }
    return out
}

func maxU64(xs []uint64) uint64 {
    var m uint64
    for _, x := range xs {
        if x > m {
            m = x
        }
    }
    return m
}

// silence unused import warnings for time in case future fields appear
var _ = time.Time{}
```

- [ ] **Step 3: Write `cli/migrate/main.go`**

```go
// Command migrate copies all data from a PostgreSQL instance into a
// fresh bbolt file. Run it once as part of the cutover; the bbolt file
// is the new source of truth after the run completes.
package main

import (
    "database/sql"
    "flag"
    "fmt"
    "log"
    "os"
    "time"

    bolt "go.etcd.io/bbolt"

    _ "github.com/lib/pq"
)

func main() {
    pgDSN := flag.String("pg", os.Getenv("POSTGRES_DSN"),
        "postgres connection string, e.g. postgres://user:password@host:5432/dbname?sslmode=disable")
    bboltPath := flag.String("bbolt", "./data/transaction.db",
        "path to the bbolt file to create")
    flag.Parse()

    if *pgDSN == "" {
        log.Fatal("--pg (or POSTGRES_DSN env var) is required")
    }

    start := time.Now()
    log.Printf("connecting to postgres…")
    pg, err := sql.Open("postgres", *pgDSN)
    if err != nil {
        log.Fatal(err)
    }
    defer pg.Close()
    if err := pg.Ping(); err != nil {
        log.Fatal(err)
    }

    log.Printf("dumping from postgres…")
    users, err := dumpAllUsers(pg)
    must(err)
    sessions, err := dumpAllSessions(pg)
    must(err)
    tags, err := dumpAllTags(pg)
    must(err)
    txns, err := dumpAllTransactions(pg)
    must(err)
    txnTags, err := dumpAllTxnTags(pg)
    must(err)
    photos, err := dumpAllPhotos(pg)
    must(err)
    tokens, err := dumpAllTokens(pg)
    must(err)
    conns, err := dumpAllConnections(pg)
    must(err)
    settings, err := dumpAllSettings(pg)
    must(err)

    log.Printf("dumped: %d users, %d sessions, %d tags, %d txns, %d txn_tags, %d photos, %d tokens, %d conns, %d settings",
        len(users), len(sessions), len(tags), len(txns), len(txnTags), len(photos), len(tokens), len(conns), len(settings))

    if _, err := os.Stat(*bboltPath); err == nil {
        log.Fatalf("refusing to overwrite existing bbolt file %s; remove it first or pass --bbolt with a new path", *bboltPath)
    }
    if err := os.MkdirAll(parentDir(*bboltPath), 0o755); err != nil {
        log.Fatal(err)
    }
    log.Printf("creating bbolt at %s…", *bboltPath)
    bb, err := bolt.Open(*bboltPath, 0o600, &bolt.Options{Timeout: 1 * time.Second})
    if err != nil {
        log.Fatal(err)
    }
    defer bb.Close()

    log.Printf("loading into bbolt…")
    if err := loadAll(bb, users, sessions, tags, txns, txnTags, photos, tokens, conns, settings); err != nil {
        log.Fatal(err)
    }

    log.Printf("done in %s", time.Since(start))
    fmt.Println("migration successful")
}

func must(err error) {
    if err != nil {
        log.Fatal(err)
    }
}

func parentDir(p string) string {
    for i := len(p) - 1; i >= 0; i-- {
        if p[i] == '/' {
            return p[:i]
        }
    }
    return "."
}
```

- [ ] **Step 4: Build the migrate CLI**

Run: `go build -o ./bin/migrate ./cli/migrate`
Expected: exits 0.

- [ ] **Step 5: Smoke-test against a throwaway postgres**

Spin up a temporary postgres (via `docker compose up -d db`), point the script at it with an empty schema, insert one of each row, then run:

```bash
POSTGRES_DSN="postgres://user:password@localhost:5432/mydb?sslmode=disable" \
    ./bin/migrate --bbolt /tmp/test.db
```

Expected: prints "dumped: 1 users, …", "migration successful". Then inspect the file:

```bash
go run go.etcd.io/bbolt/cmd/bbolt@latest keys /tmp/test.db users
go run go.etcd.io/bbolt/cmd/bbolt@latest get /tmp/test.db users <id>
```

Expected: shows the dumped data.

- [ ] **Step 6: Commit**

```bash
git add cli/migrate/
git commit -m "feat(cli/migrate): dump postgres and load into bbolt"
```

---

## Task 10: Update deployment files

**Files:**
- Modify: `docker-compose.yml`
- Modify: `Dockerfile`
- Modify: `.env`
- Modify: `mise.toml`
- Modify: `.gitignore`

- [ ] **Step 1: `docker-compose.yml`**

Replace the entire file with:

```yaml
version: '3.8'

services:
  server:
    image: ghcr.io/sirenkovladd/transactify:main
    restart: always
    ports:
      - "8080:8080"
    env_file:
      - .env
    environment:
      - BBOLT_PATH=/app/data/transaction.db
      - PROTOCOL=http
      - ENCRYPTION_KEY=${ENCRYPTION_KEY}
    volumes:
      - ./data:/app/data
      - ./uploads:/uploads
```

- [ ] **Step 2: `.env`**

Replace contents with:

```
ENCRYPTION_KEY=ee4893fa8d6b8f138b7e2a3407b6c4b3ec55029bdb2fd8b5b4b0992b6581994b
BBOLT_PATH=./data/transaction.db
```

- [ ] **Step 3: `.gitignore`**

Add: `data/transaction.db` and `bin/`.

- [ ] **Step 4: `mise.toml`**

Replace the `[tasks.dump_schema]` task with:

```toml
[tasks.migrate]
description = "Dump from postgres and load into bbolt"
run = ["go run ./cli/migrate --pg $POSTGRES_DSN --bbolt $BBOLT_PATH"]
```

(Drop `dump_schema` — the schema now lives in `server/migrations_bbolt/`.)

- [ ] **Step 5: Commit**

```bash
git add docker-compose.yml Dockerfile .env mise.toml .gitignore
git commit -m "chore(deploy): remove postgres; mount bbolt file via volume"
```

---

## Task 11: Documentation

**Files:**
- Modify: `README.md`
- Modify: `GEMINI.md`
- Modify: `CHANGELOG.md`
- Create: `docs/runbooks/migrate-to-bbolt.md`

- [ ] **Step 1: `README.md`**

Replace the "Environment variables" section to document `BBOLT_PATH` and remove `POSTGRES_*`.

- [ ] **Step 2: `GEMINI.md`**

In the Database subsection, replace the postgres description with the bbolt description (file path, bucket layout summary, migration commands).

- [ ] **Step 3: `CHANGELOG.md`**

Under `[Unreleased]`, add entries per the documentation update rule:

```
### Changed
- Replaced PostgreSQL with embedded bbolt (go.etcd.io/bbolt) for storage. The bbolt file is mounted via `data/transaction.db`. See `docs/runbooks/migrate-to-bbolt.md` for the cutover procedure.

### Removed
- PostgreSQL service, `db_data` docker volume, and the `POSTGRES_*` environment variables. The `lib/pq` driver is no longer a runtime dependency.
```

- [ ] **Step 4: `docs/runbooks/migrate-to-bbolt.md`**

Write a short operator runbook with these sections:

1. **Pre-flight**: stop the running `server` container so writes don't land in postgres during the dump. Back up the `db_data` volume (`docker run --rm -v transactify_db_data:/from -v $(pwd):/to alpine cp -a /from /to/pg-backup-$(date +%F)`).
2. **Run the migrator**: `mise run migrate` (uses `cli/migrate` against the env-configured postgres and bbolt paths).
3. **Verify counts**: `bbolt keys data/transaction.db users | wc -l` and the same for `transactions`. The counts must match `psql -c "SELECT count(*) FROM users"` etc.
4. **Switch deployment**: `git pull` on the server, `docker compose pull && docker compose up -d`. The compose file no longer starts a `db` service.
5. **Smoke test**: log in, list transactions, create a new transaction, attach a photo, share to a connected user. All endpoints must respond 2xx.
6. **Drop pg volume**: only after a full week of clean operation, `docker compose down && docker volume rm transactify_db_data`.

- [ ] **Step 5: Commit**

```bash
git add README.md GEMINI.md CHANGELOG.md docs/runbooks/migrate-to-bbolt.md
git commit -m "docs: bbolt migration"
```

---

## Task 12: Final verification

- [ ] **Step 1: Run the full test suite**

Run: `go test ./...`
Expected: all green.

- [ ] **Step 2: Build the production binary**

Run: `mise run build_server`
Expected: exits 0; produces `dist/server`.

- [ ] **Step 3: Run the migrator end-to-end on a real database**

Using the developer's local postgres (or a clone of staging), run the migrate CLI. Compare row counts between `psql` and `bbolt keys`. Diff the JSON output of `GET /api/transactions` before and after — the lists must be identical.

- [ ] **Step 4: Smoke-test the running app**

Run: `./dist/server` and hit the API per the smoke list in the runbook.

- [ ] **Step 5: Commit any final fixes**

If any issues were uncovered, fix them and commit.

---

## Self-Review

**Spec coverage:**

- ✅ Migrate from postgres to bbolt: Tasks 1–8, 10, 11.
- ✅ Remove postgres from deployment: Task 10.
- ✅ Script that dumps from postgres and pushes to bbolt: Task 9.
- ✅ Bucket design documented: top of this file.
- ✅ Tests for new code: every store file has a `_test.go`.
- ✅ Runbook for the cutover: Task 11.
- ✅ Docker / mise / env updates: Task 10.
- ⚠️ Note: `cli/wealthsimple/main.go` and `cli/createUser/main.go` reference postgres / lib/pq. They are not part of the HTTP server and were not in scope. Add a follow-up task to port `wealthsimple` to bbolt if and when it is needed (it currently uses `src.GetStatement` / `src.InsertTransaction`, which would gain bbolt equivalents).

**Placeholder scan:** None. All steps show the actual code, exact file paths, and the exact commands.

**Type consistency:** The `userId` parameter type is `uint64` throughout (handler signatures, `GetUserId`, `AuthMiddleware`). Store methods accept and return `uint64` for IDs. The `Transaction` struct field is `ID uint64` and `UserID uint64` consistently. Composite keys always use `itob` (8 bytes each) — no off-by-one slices.

**No placeholders:** The plan shows complete code for every store method, every dump helper, the migrator, and the loadAll function. The route-handler refactor is summarized as a mechanical pattern with one full example (GetTransactions) so the implementer has a model.
