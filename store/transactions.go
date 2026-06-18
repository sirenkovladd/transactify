package store

import (
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

// CreateTransaction inserts a new transaction and indexes it under
// (user_id, occurred_at_unix_nano, txn_id) in txn_by_user_time. The
// unique constraint from postgres (user_id, merchant, occurred_at, amount)
// is enforced at the application layer by callers (see AddTransactions
// in the route layer); CreateTransaction itself does not deduplicate.
func (s *Store) CreateTransaction(t *Transaction) error {
	return s.Update(func(tx *bolt.Tx) error {
		id, err := tx.Bucket([]byte("seq_transactions")).NextSequence()
		if err != nil {
			return err
		}
		t.ID = id
		buf, err := json.Marshal(t)
		if err != nil {
			return err
		}
		if err := tx.Bucket([]byte("transactions")).Put(itob(id), buf); err != nil {
			return err
		}
		return tx.Bucket([]byte("txn_by_user_time")).Put(TxByUserTimeKey(t.UserID, t.OccurredAt, t.ID), itob(t.ID))
	})
}

// ListTransactionsForUser returns transactions belonging to userID, ordered
// by occurred_at DESC. The cursor walks the (user_id, ...) prefix in
// ascending key order (oldest first), and the function reverses the slice
// to deliver newest-first. For typical per-user volumes this is well
// under a millisecond.
func (s *Store) ListTransactionsForUser(userID uint64) ([]Transaction, error) {
	var out []Transaction
	err := s.View(func(tx *bolt.Tx) error {
		idx := tx.Bucket([]byte("txn_by_user_time"))
		prefix := itob(userID)
		c := idx.Cursor()
		var ids []uint64
		for k, v := c.Seek(prefix); k != nil && hasPrefix(k, prefix); k, v = c.Next() {
			ids = append(ids, btoi(v))
		}
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

func (s *Store) GetTransaction(id uint64) (*Transaction, error) {
	var t Transaction
	err := s.View(func(tx *bolt.Tx) error {
		raw := tx.Bucket([]byte("transactions")).Get(itob(id))
		if raw == nil {
			return ErrNotFound
		}
		return json.Unmarshal(raw, &t)
	})
	if err != nil {
		return nil, err
	}
	return &t, nil
}

func (s *Store) UpdateTransaction(t *Transaction) error {
	return s.Update(func(tx *bolt.Tx) error {
		// Update the index entry if (user_id, occurred_at) changed.
		old, err := s.GetTransaction(t.ID)
		if err != nil {
			return err
		}
		if old.UserID != t.UserID || !old.OccurredAt.Equal(t.OccurredAt) {
			if err := tx.Bucket([]byte("txn_by_user_time")).Delete(TxByUserTimeKey(old.UserID, old.OccurredAt, old.ID)); err != nil {
				return err
			}
			if err := tx.Bucket([]byte("txn_by_user_time")).Put(TxByUserTimeKey(t.UserID, t.OccurredAt, t.ID), itob(t.ID)); err != nil {
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
		if err := tx.Bucket([]byte("txn_by_user_time")).Delete(TxByUserTimeKey(t.UserID, t.OccurredAt, t.ID)); err != nil {
			return err
		}
		// Cascade: drop every txn_tags link for this transaction.
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

// TxByUserTimeKey builds the secondary index key for txn_by_user_time.
// Exported so callers (and the dump script's load path) can use the same
// layout. Layout:
//
//	itob(user_id) | itob(occurred_at_unix_nano) | itob(txn_id)
//
// The user_id is a fixed-width 8-byte prefix so a Cursor.Seek+prefix
// scan returns all transactions for a user in occurred_at ASC order;
// ListTransactionsForUser reverses the slice for DESC.
func TxByUserTimeKey(userID uint64, occurredAt time.Time, txnID uint64) []byte {
	out := make([]byte, 0, 24)
	out = append(out, itob(userID)...)
	out = append(out, itob(uint64(occurredAt.UnixNano()))...)
	out = append(out, itob(txnID)...)
	return out
}
