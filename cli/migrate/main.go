// Command migrate copies all data from a PostgreSQL instance into a fresh
// bbolt file. It is the one-shot cutover tool described in
// docs/superpowers/plans/2026-06-17-migrate-postgres-to-bbolt.md.
//
// Usage:
//
//	POSTGRES_DSN="postgres://user:pw@host:5432/db?sslmode=disable" \
//	    go run ./cli/migrate --bbolt ./data/transaction.db
//
// The script refuses to overwrite an existing bbolt file. The dump and
// the load run sequentially; the bbolt transaction is atomic, so a
// partial failure leaves the bbolt file in its previous state.
package main

import (
	"database/sql"
	"errors"
	"flag"
	"fmt"
	"log"
	"os"
	"path/filepath"
	"time"

	bolt "go.etcd.io/bbolt"

	_ "github.com/lib/pq"
)

func main() {
	pgDSN := flag.String("pg", os.Getenv("POSTGRES_DSN"),
		"postgres connection string (or set POSTGRES_DSN env var)")
	bboltPath := flag.String("bbolt", "./data/transaction.db",
		"path to the bbolt file to create")
	skipVerify := flag.Bool("skip-verify", false,
		"skip the post-load count verification (useful for huge tables)")
	flag.Parse()

	if *pgDSN == "" {
		log.Fatal("--pg (or POSTGRES_DSN env var) is required")
	}
	if *bboltPath == "" {
		log.Fatal("--bbolt must be a non-empty path")
	}

	start := time.Now()

	log.Printf("connecting to postgres…")
	pg, err := sql.Open("postgres", *pgDSN)
	must(err)
	defer pg.Close()
	must(pg.Ping())

	log.Printf("dumping from postgres…")
	users, err := dumpAllUsers(pg)
	must(err)
	sessions, err := dumpAllSessions(pg)
	must(err)
	tags, err := dumpAllTags(pg)
	must(err)
	txns, err := dumpAllTransactions(pg)
	must(err)
	txnTags, err := dumpAllTxnTags(pg)
	must(err)
	photos, err := dumpAllPhotos(pg)
	must(err)
	tokens, err := dumpAllTokens(pg)
	must(err)
	conns, err := dumpAllConnections(pg)
	must(err)
	settings, err := dumpAllSettings(pg)
	must(err)

	log.Printf("dumped: %d users, %d sessions, %d tags, %d transactions, %d transaction_tags, %d photos, %d tokens, %d connections, %d settings",
		len(users), len(sessions), len(tags), len(txns), len(txnTags), len(photos), len(tokens), len(conns), len(settings))

	if _, err := os.Stat(*bboltPath); err == nil {
		log.Fatalf("refusing to overwrite existing bbolt file %s; remove it first or pass --bbolt with a new path", *bboltPath)
	} else if !errors.Is(err, os.ErrNotExist) {
		log.Fatalf("stat %s: %v", *bboltPath, err)
	}
	if err := os.MkdirAll(filepath.Dir(*bboltPath), 0o755); err != nil {
		log.Fatalf("mkdir parent: %v", err)
	}

	log.Printf("creating bbolt at %s…", *bboltPath)
	bb, err := bolt.Open(*bboltPath, 0o600, &bolt.Options{Timeout: 1 * time.Second})
	must(err)
	defer bb.Close()

	log.Printf("loading into bbolt…")
	must(loadAll(bb, users, sessions, tags, txns, txnTags, photos, tokens, conns, settings))

	if !*skipVerify {
		log.Printf("verifying…")
		must(verifyLoaded(bb, len(users), len(txns), len(tags), len(photos), len(tokens), len(conns), len(sessions), len(settings)))
	}

	log.Printf("done in %s", time.Since(start))
	fmt.Println("migration successful")
}

func must(err error) {
	if err != nil {
		log.Fatal(err)
	}
}

// verifyLoaded confirms the row counts in bbolt match the dumped
// counts. It does not check every column, only that the right number
// of keys landed in each bucket.
func verifyLoaded(bb *bolt.DB, users, txns, tags, photos, tokens, conns, sessions, settings int) error {
	return bb.View(func(tx *bolt.Tx) error {
		checks := []struct {
			name     string
			expected int
		}{
			{"users", users},
			{"transactions", txns},
			{"tags", tags},
			{"txn_photos", photos},
			{"sharing_tokens", tokens},
			{"user_connections", conns},
			{"sessions", sessions},
			{"settings", settings},
		}
		for _, c := range checks {
			b := tx.Bucket([]byte(c.name))
			if b == nil {
				return fmt.Errorf("bucket %q missing after load", c.name)
			}
			n := b.Stats().KeyN
			if int(n) != c.expected {
				return fmt.Errorf("bucket %q: expected %d keys, got %d", c.name, c.expected, n)
			}
		}
		return nil
	})
}
