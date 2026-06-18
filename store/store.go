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
//
// Note: sequence buckets (`seq_*`) are intentionally one-per-table.
// bbolt's NextSequence() is a per-bucket method, and the store
// allocates IDs via `tx.Bucket([]byte("seq_users")).NextSequence()`
// etc. (see Task 4). The single `seq` bucket from the original draft
// was replaced by these per-table buckets to match the call sites.
var topLevelBuckets = []string{
	"meta",
	"seq_users", "seq_tags", "seq_transactions",
	"seq_photos", "seq_tokens", "seq_connections",
	"users", "users_by_username",
	"sessions",
	"tags", "tags_by_id",
	"transactions", "txn_by_user_time",
	"txn_tags",
	"txn_photos", "photos_by_path",
	"sharing_tokens", "sharing_tokens_by_user",
	"user_connections", "subscriptions_by_user",
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
