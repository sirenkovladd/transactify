package main

import (
	"encoding/binary"
	"encoding/json"
	"fmt"

	bolt "go.etcd.io/bbolt"

	"code.sirenko.ca/transaction/store"
)

// allBuckets lists every top-level bucket the loadAll function creates.
// Order matches the layout in
// docs/superpowers/plans/2026-06-17-migrate-postgres-to-bbolt.md
// (Bucket Design section) so reviewers can cross-check by eye.
var allBuckets = []string{
	"meta",
	"seq_users", "seq_tags", "seq_transactions", "seq_photos", "seq_tokens",
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

func createBuckets(tx *bolt.Tx) error {
	for _, name := range allBuckets {
		if _, err := tx.CreateBucketIfNotExists([]byte(name)); err != nil {
			return fmt.Errorf("create bucket %q: %w", name, err)
		}
	}
	return nil
}

// loadAll writes every dumped row into the bbolt file in a single
// transaction. If any step fails the file is left unchanged.
func loadAll(s *bolt.DB,
	users []dumpUsers,
	sessions []dumpSessions,
	tags []dumpTags,
	txns []dumpTransactions,
	txnTags []dumpTxnTags,
	photos []dumpPhotos,
	tokens []dumpTokens,
	conns []dumpConnections,
	settings []dumpSettings,
) error {
	return s.Update(func(tx *bolt.Tx) error {
		if err := createBuckets(tx); err != nil {
			return err
		}
		// Seed sequences from postgres SERIAL max IDs so subsequent
		// inserts via the server pick IDs that don't collide with the
		// migrated data.
		if err := seedSeq(tx, "seq_users", maxU64(userIDs(users))); err != nil {
			return err
		}
		if err := seedSeq(tx, "seq_tags", maxU64(tagIDs(tags))); err != nil {
			return err
		}
		if err := seedSeq(tx, "seq_transactions", maxU64(txnIDs(txns))); err != nil {
			return err
		}
		if err := seedSeq(tx, "seq_photos", maxU64(photoIDs(photos))); err != nil {
			return err
		}
		if err := seedSeq(tx, "seq_tokens", maxU64(tokenIDs(tokens))); err != nil {
			return err
		}

		// users
		for _, u := range users {
			buf, err := json.Marshal(map[string]interface{}{
				"id":            u.ID,
				"username":      u.Username,
				"hash_password": u.HashPassword,
				"person_name":   u.PersonName,
				"otp_enabled":   u.OTPEnabled,
			})
			if err != nil {
				return err
			}
			if err := tx.Bucket([]byte("users")).Put(itob64(u.ID), buf); err != nil {
				return err
			}
			if err := tx.Bucket([]byte("users_by_username")).Put([]byte(u.Username), itob64(u.ID)); err != nil {
				return err
			}
		}

		// sessions
		for _, sess := range sessions {
			buf, err := json.Marshal(map[string]interface{}{
				"code":      sess.Code,
				"user_id":   sess.UserID,
				"device":    sess.Device,
				"last_ip":   sess.LastIP,
				"last_used": sess.LastUsed,
			})
			if err != nil {
				return err
			}
			if err := tx.Bucket([]byte("sessions")).Put([]byte(sess.Code), buf); err != nil {
				return err
			}
		}

		// tags
		for _, t := range tags {
			buf, err := json.Marshal(map[string]interface{}{"id": t.ID, "name": t.Name})
			if err != nil {
				return err
			}
			if err := tx.Bucket([]byte("tags")).Put([]byte(t.Name), buf); err != nil {
				return err
			}
			if err := tx.Bucket([]byte("tags_by_id")).Put(itob64(t.ID), []byte(t.Name)); err != nil {
				return err
			}
		}

		// transactions + secondary index
		for _, t := range txns {
			buf, err := json.Marshal(map[string]interface{}{
				"id":          t.ID,
				"user_id":     t.UserID,
				"amount":      t.Amount,
				"currency":    t.Currency,
				"occurred_at": t.OccurredAt,
				"merchant":    t.Merchant,
				"card":        t.Card,
				"category":    t.Category,
				"details":     t.Details,
			})
			if err != nil {
				return err
			}
			if err := tx.Bucket([]byte("transactions")).Put(itob64(t.ID), buf); err != nil {
				return err
			}
			idxKey := store.TxByUserTimeKey(t.UserID, t.OccurredAt, t.ID)
			if err := tx.Bucket([]byte("txn_by_user_time")).Put(idxKey, itob64(t.ID)); err != nil {
				return err
			}
		}

		// transaction_tags
		for _, x := range txnTags {
			key := append(itob64(x.TxnID), itob64(x.TagID)...)
			if err := tx.Bucket([]byte("txn_tags")).Put(key, []byte{}); err != nil {
				return err
			}
		}

		// photos
		for _, p := range photos {
			buf, err := json.Marshal(map[string]interface{}{
				"id":             p.ID,
				"transaction_id": p.TransactionID,
				"file_path":      p.FilePath,
				"created_at":     p.CreatedAt,
			})
			if err != nil {
				return err
			}
			if err := tx.Bucket([]byte("txn_photos")).Put(itob64(p.ID), buf); err != nil {
				return err
			}
			if err := tx.Bucket([]byte("photos_by_path")).Put([]byte(p.FilePath), itob64(p.ID)); err != nil {
				return err
			}
		}

		// sharing tokens
		for _, t := range tokens {
			buf, err := json.Marshal(map[string]interface{}{
				"id":         t.ID,
				"user_id":    t.UserID,
				"token":      t.Token,
				"created_at": t.CreatedAt,
			})
			if err != nil {
				return err
			}
			if err := tx.Bucket([]byte("sharing_tokens")).Put([]byte(t.Token), buf); err != nil {
				return err
			}
			key := append(itob64(t.UserID), itob64(t.ID)...)
			if err := tx.Bucket([]byte("sharing_tokens_by_user")).Put(key, []byte(t.Token)); err != nil {
				return err
			}
		}

		// user_connections + reverse index
		for _, c := range conns {
			buf, err := json.Marshal(map[string]interface{}{
				"user_id":           c.UserID,
				"connected_user_id": c.ConnectedUser,
				"created_at":        c.CreatedAt,
			})
			if err != nil {
				return err
			}
			key := append(itob64(c.UserID), itob64(c.ConnectedUser)...)
			if err := tx.Bucket([]byte("user_connections")).Put(key, buf); err != nil {
				return err
			}
			revKey := append(itob64(c.ConnectedUser), itob64(c.UserID)...)
			if err := tx.Bucket([]byte("subscriptions_by_user")).Put(revKey, itob64(c.UserID)); err != nil {
				return err
			}
		}

		// settings
		for _, st := range settings {
			buf, err := json.Marshal(map[string]interface{}{
				"key":        st.Key,
				"value":      json.RawMessage(st.Value),
				"updated_at": st.UpdatedAt,
			})
			if err != nil {
				return err
			}
			if err := tx.Bucket([]byte("settings")).Put([]byte(st.Key), buf); err != nil {
				return err
			}
		}

		// Mark the initial-buckets migration as applied so a server
		// that opens this file later doesn't try to re-create them.
		return tx.Bucket([]byte("meta")).Put([]byte("applied:001_initial_buckets"), []byte("1"))
	})
}

// seedSeq advances the bbolt bucket sequence to maxID. After this call,
// the next NextSequence() returns maxID + 1.
func seedSeq(tx *bolt.Tx, name string, maxID uint64) error {
	b := tx.Bucket([]byte(name))
	if b == nil {
		return fmt.Errorf("bucket %s missing", name)
	}
	return b.SetSequence(maxID)
}

func itob64(v uint64) []byte {
	b := make([]byte, 8)
	binary.BigEndian.PutUint64(b, v)
	return b
}

func userIDs(xs []dumpUsers) []uint64 {
	out := make([]uint64, len(xs))
	for i, x := range xs {
		out[i] = x.ID
	}
	return out
}

func tagIDs(xs []dumpTags) []uint64 {
	out := make([]uint64, len(xs))
	for i, x := range xs {
		out[i] = x.ID
	}
	return out
}

func txnIDs(xs []dumpTransactions) []uint64 {
	out := make([]uint64, len(xs))
	for i, x := range xs {
		out[i] = x.ID
	}
	return out
}

func photoIDs(xs []dumpPhotos) []uint64 {
	out := make([]uint64, len(xs))
	for i, x := range xs {
		out[i] = x.ID
	}
	return out
}

func tokenIDs(xs []dumpTokens) []uint64 {
	out := make([]uint64, len(xs))
	for i, x := range xs {
		out[i] = x.ID
	}
	return out
}

func maxU64(xs []uint64) uint64 {
	var m uint64
	for _, x := range xs {
		if x > m {
			m = x
		}
	}
	return m
}
