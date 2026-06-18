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
