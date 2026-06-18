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
