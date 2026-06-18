package migrationsbbolt

import bolt "go.etcd.io/bbolt"

var v001InitialBuckets = Migration{
	Version: "001_initial_buckets",
	Apply: func(tx *bolt.Tx) error {
		// Mirrors store.Init's topLevelBuckets. Per-table sequence
		// buckets (seq_*) are kept here too so the migration is
		// self-contained if a future tool opens the bbolt file
		// without going through store.Init first.
		for _, name := range []string{
			"meta",
			"seq_users", "seq_tags", "seq_transactions",
			"seq_photos", "seq_tokens", "seq_connections",
			"users", "users_by_username",
			"sessions",
			"tags", "tags_by_id",
			"transactions", "txn_by_user_time",
			"txn_tags",
			"txn_photos", "photos_by_path",
			"sharing_tokens", "sharing_tokens_by_user",
			"user_connections", "subscriptions_by_user",
			"settings",
		} {
			if _, err := tx.CreateBucketIfNotExists([]byte(name)); err != nil {
				return err
			}
		}
		return nil
	},
}
