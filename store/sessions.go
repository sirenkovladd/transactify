package store

import (
	"encoding/json"
	"time"

	bolt "go.etcd.io/bbolt"
)

// Session is a bearer token issued at login. The Code is the public
// token the client sends in the Authorization header. LastUsed is
// updated on every authenticated request (see GetSessionByCode).
type Session struct {
	Code     string    `json:"code"`
	UserID   uint64    `json:"user_id"`
	Device   string    `json:"device"`
	LastIP   string    `json:"last_ip"`
	LastUsed time.Time `json:"last_used"`
}

// CreateSession inserts a new session row keyed by Code.
func (s *Store) CreateSession(sess *Session) error {
	return s.Update(func(tx *bolt.Tx) error {
		buf, err := json.Marshal(sess)
		if err != nil {
			return err
		}
		return tx.Bucket([]byte("sessions")).Put([]byte(sess.Code), buf)
	})
}

// GetSessionByCode returns the session and bumps LastUsed to now.
// This mirrors the postgres handler that did
//
//	UPDATE sessions SET last_used = now() WHERE session_code = $1 RETURNING user_id
//
// Returns ErrNotFound if the code is not registered.
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

// DeleteSession removes the session iff it belongs to userID. The
// postgres handler's "AND user_id = $2" guard is preserved: a request
// to delete a session that doesn't belong to the caller is a no-op
// (not an error) to match the original behavior.
func (s *Store) DeleteSession(code string, userID uint64) error {
	return s.Update(func(tx *bolt.Tx) error {
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
