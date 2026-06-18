package store

import (
	"encoding/json"

	bolt "go.etcd.io/bbolt"
)

type Tag struct {
	ID   uint64 `json:"id"`
	Name string `json:"name"`
}

// getOrCreateTagTx is the in-transaction form of GetOrCreateTag. It runs
// inside an existing s.Update(...) callback so the caller doesn't open a
// nested write transaction (bbolt's writer lock is not reentrant).
func getOrCreateTagTx(tx *bolt.Tx, name string) (*Tag, error) {
	byName := tx.Bucket([]byte("tags"))
	byID := tx.Bucket([]byte("tags_by_id"))
	if raw := byName.Get([]byte(name)); raw != nil {
		var tag Tag
		if err := json.Unmarshal(raw, &tag); err != nil {
			return nil, err
		}
		return &tag, nil
	}
	id, err := tx.Bucket([]byte("seq_tags")).NextSequence()
	if err != nil {
		return nil, err
	}
	tag := Tag{ID: id, Name: name}
	buf, err := json.Marshal(&tag)
	if err != nil {
		return nil, err
	}
	if err := byName.Put([]byte(name), buf); err != nil {
		return nil, err
	}
	if err := byID.Put(itob(id), []byte(name)); err != nil {
		return nil, err
	}
	return &tag, nil
}

// GetOrCreateTag returns the tag with the given name, creating it if it
// does not exist. The tag's ID is allocated from the seq_tags bucket
// sequence on creation.
func (s *Store) GetOrCreateTag(name string) (*Tag, error) {
	var tag *Tag
	err := s.Update(func(tx *bolt.Tx) error {
		t, err := getOrCreateTagTx(tx, name)
		if err != nil {
			return err
		}
		tag = t
		return nil
	})
	return tag, err
}
