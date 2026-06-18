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
	UserID        uint64    `json:"user_id"`
	ConnectedUser uint64    `json:"connected_user_id"`
	CreatedAt     time.Time `json:"created_at"`
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
// It also writes the reverse index so ListSubscribers(connectedUserID) can find userID.
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
		// Reverse index: subscriptions_by_user is keyed by connectedUserID
		// so ListSubscribers(connectedUserID) can range-scan it.
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
