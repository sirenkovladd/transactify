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
		// Resolve desired set to tag IDs (creating as needed). Uses the
		// in-transaction helper to avoid a nested s.Update call (bbolt's
		// writer lock is not reentrant — a nested write would deadlock).
		desired := map[uint64]bool{}
		for _, name := range names {
			if name == "" {
				continue
			}
			tag, err := getOrCreateTagTx(tx, name)
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
