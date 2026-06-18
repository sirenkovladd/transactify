package store

import (
	"encoding/json"
	"errors"
	"fmt"

	bolt "go.etcd.io/bbolt"
)

// ErrNotFound is returned by lookup methods when the requested key
// does not exist in its bucket. Callers should use errors.Is to test.
var ErrNotFound = errors.New("store: not found")

// User is the persistent record for an account. The JSON tags match
// the postgres column names so a future migration in either direction
// is mechanical.
type User struct {
	ID           uint64 `json:"id"`
	Username     string `json:"username"`
	HashPassword string `json:"hash_password"`
	PersonName   string `json:"person_name"`
	OTPEnabled   string `json:"otp_enabled,omitempty"`
}

// CreateUser inserts a new user, assigning u.ID from the seq_users
// bucket. Rejects duplicate usernames.
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

// GetUserByID returns the user with the given ID, or ErrNotFound.
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

// GetUserByUsername resolves the username → ID via the secondary
// index, then loads the user record. Returns ErrNotFound if the
// username is not registered.
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

// UpdateUser overwrites the user record in place. The username
// secondary index is not updated; usernames are immutable in this
// design (matches the original schema, where the username is
// UNIQUE and not part of any UPDATE statement).
func (s *Store) UpdateUser(u *User) error {
	return s.Update(func(tx *bolt.Tx) error {
		buf, err := json.Marshal(u)
		if err != nil {
			return err
		}
		return tx.Bucket([]byte("users")).Put(itob(u.ID), buf)
	})
}
