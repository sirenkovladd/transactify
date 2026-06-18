package migrationsbbolt

import (
	bolt "go.etcd.io/bbolt"
)

// Migration creates or updates schema. Applied in slice order, each at most once.
type Migration struct {
	Version string
	Apply   func(tx *bolt.Tx) error
}

var All = []Migration{
	v001InitialBuckets,
}
