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
	err := s.View(func(tx *bolt.Tx) error {
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
