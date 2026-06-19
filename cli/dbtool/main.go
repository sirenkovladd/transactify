// dbtool is a one-off CLI for inspecting and mutating the bbolt database
// without going through the running server. It is intentionally minimal:
// every destructive subcommand is a dry-run by default. Pass --apply to
// actually mutate the file.
//
// Examples:
//
//	# Inspect
//	go run ./cli/dbtool list
//	go run ./cli/dbtool list --bucket sessions
//
//	# Dry-run: see what would be deleted
//	go run ./cli/dbtool delete-session --code 10997d49...
//	go run ./cli/dbtool delete-sessions --user 2
//	go run ./cli/dbtool delete-user --id 2
//
//	# Apply (writes the file)
//	go run ./cli/dbtool delete-sessions --user 2 --apply
package main

import (
	"encoding/binary"
	"encoding/hex"
	"encoding/json"
	"flag"
	"fmt"
	"io"
	"log"
	"os"
	"time"

	bolt "go.etcd.io/bbolt"
)

// Bucket names. Mirrors store.topLevelBuckets.
const (
	bUsers            = "users"
	bUsersByUsername  = "users_by_username"
	bSessions         = "sessions"
	bTransactions     = "transactions"
	bTxnByUserTime    = "txn_by_user_time"
	bTxnTags          = "txn_tags"
	bTxnPhotos        = "txn_photos"
	bPhotosByPath     = "photos_by_path"
	bSharingTokens    = "sharing_tokens"
	bSharingTokensByU = "sharing_tokens_by_user"
	bUserConnections  = "user_connections"
	bSubscriptionsByU = "subscriptions_by_user"
	bSettings         = "settings"
)

func main() {
	if len(os.Args) < 2 {
		usage()
		os.Exit(2)
	}
	rest := os.Args[1:]

	// Pull -db <path> off the front if present, so the rest is
	// <command> [flags]. Stops at the first non-flag token.
	dbPath := "./data/transaction.db"
	for len(rest) >= 2 && rest[0] == "-db" {
		dbPath = rest[1]
		rest = rest[2:]
	}
	if len(rest) < 1 {
		usage()
		os.Exit(2)
	}
	cmd := rest[0]
	args := rest[1:]

	switch cmd {
	case "list":
		runList(dbPath, args)
	case "delete":
		runDelete(dbPath, args)
	case "set":
		runSet(dbPath, args)
	case "delete-session":
		runDeleteSession(dbPath, args)
	case "delete-sessions":
		runDeleteSessions(dbPath, args)
	case "delete-user":
		runDeleteUser(dbPath, args)
	default:
		usage()
		os.Exit(2)
	}
}

func usage() {
	fmt.Fprintln(os.Stderr, `usage: dbtool <command> [flags]

commands:
  list                enumerate keys (and values) in a bucket
  delete              delete one row: --bucket <name> --key <key> [--key-hex]
  set                 write one row:  --bucket <name> --key <key> --value <v>
                                    [--key-hex] [--value-file <path>]
                                    [--value-stdin] [--value-hex]

  delete-session      delete one session by --code (alias of delete --bucket sessions)
  delete-sessions     delete sessions by --user <id> | --all | --code <code>
  delete-user         delete a user by --id, with full cascade across buckets

global flags (must come before subcommand args):
  -db <path>          path to the bbolt file (default: ./data/transaction.db)
`)
}

func openDB(path string, readonly bool) (*bolt.DB, error) {
	return bolt.Open(path, 0o600, &bolt.Options{Timeout: 1 * time.Second, ReadOnly: readonly})
}

func must(err error) {
	if err != nil {
		log.Fatal(err)
	}
}

func mustPair[T any](v T, err error) T {
	must(err)
	return v
}

// ---------- list ----------

func runList(path string, args []string) {
	fs := flag.NewFlagSet("list", flag.ExitOnError)
	bucket := fs.String("bucket", "", "bucket to enumerate (default: top-level list)")
	raw := fs.Bool("raw", false, "print raw bytes for keys/values (skip JSON pretty-print and hex decode)")
	limit := fs.Int("limit", 0, "max records to print (0 = all)")
	fs.Parse(args)

	db := mustPair(openDB(path, true))
	defer db.Close()

	must(db.View(func(tx *bolt.Tx) error {
		if *bucket == "" {
			return tx.ForEach(func(name []byte, _ *bolt.Bucket) error {
				fmt.Println(string(name))
				return nil
			})
		}
		b := tx.Bucket([]byte(*bucket))
		if b == nil {
			return fmt.Errorf("bucket %q does not exist", *bucket)
		}
		count := 0
		return b.ForEach(func(k, v []byte) error {
			if *limit > 0 && count >= *limit {
				return nil
			}
			count++
			printKV(k, v, *raw)
			return nil
		})
	}))
}

func printKV(k, v []byte, raw bool) {
	ks := decodeKey(k, raw)
	if v == nil {
		fmt.Printf("[%s] (no value)\n", ks)
		return
	}
	// Values stored as JSON: pretty-print if valid, else fall back to string.
	if !raw {
		var any interface{}
		if err := json.Unmarshal(v, &any); err == nil {
			pretty, _ := json.MarshalIndent(any, "    ", "  ")
			fmt.Printf("[%s]\n    %s\n", ks, string(pretty))
			return
		}
	}
	fmt.Printf("[%s] %s\n", ks, string(v))
}

// decodeKey tries to render the key in the friendliest form. If it looks
// like printable ASCII, print it as-is. Otherwise hex-encode.
func decodeKey(k []byte, raw bool) string {
	if raw {
		return fmt.Sprintf("%x", k)
	}
	if isPrintableASCII(k) {
		return string(k)
	}
	return fmt.Sprintf("%x", k)
}

func isPrintableASCII(b []byte) bool {
	if len(b) == 0 {
		return false
	}
	for _, c := range b {
		if c < 0x20 || c > 0x7e {
			return false
		}
	}
	return true
}

// ---------- generic delete ----------

func runDelete(path string, args []string) {
	fs := flag.NewFlagSet("delete", flag.ExitOnError)
	bucket := fs.String("bucket", "", "bucket name (required)")
	keyStr := fs.String("key", "", "key (required)")
	keyHex := fs.Bool("key-hex", false, "interpret --key as a hex string")
	apply := fs.Bool("apply", false, "actually mutate the file")
	fs.Parse(args)
	if *bucket == "" || *keyStr == "" {
		log.Fatal("--bucket and --key are required")
	}

	key, err := parseKey(*keyStr, *keyHex)
	must(err)

	db := mustPair(openDB(path, false))
	defer db.Close()

	must(db.Update(func(tx *bolt.Tx) error {
		b := tx.Bucket([]byte(*bucket))
		if b == nil {
			return fmt.Errorf("bucket %q does not exist", *bucket)
		}
		existing := b.Get(key)
		if existing == nil {
			return fmt.Errorf("key %s not found in bucket %q", formatKeyForLog(key), *bucket)
		}
		if *apply {
			must(b.Delete(key))
			fmt.Printf("DELETED %s[%s] (value was %d bytes)\n", *bucket, formatKeyForLog(key), len(existing))
		} else {
			fmt.Printf("DRY-RUN: would delete %s[%s] (value is %d bytes)\n", *bucket, formatKeyForLog(key), len(existing))
		}
		return nil
	}))

	if !*apply {
		fmt.Println("(pass --apply to actually mutate)")
	}
}

// ---------- generic set ----------

func runSet(path string, args []string) {
	fs := flag.NewFlagSet("set", flag.ExitOnError)
	bucket := fs.String("bucket", "", "bucket name (required)")
	keyStr := fs.String("key", "", "key (required)")
	keyHex := fs.Bool("key-hex", false, "interpret --key as a hex string")
	value := fs.String("value", "", "value to write")
	valueFile := fs.String("value-file", "", "read value from this file")
	valueStdin := fs.Bool("value-stdin", false, "read value from stdin")
	valueHex := fs.Bool("value-hex", false, "interpret --value (or stdin/file) as a hex string")
	apply := fs.Bool("apply", false, "actually mutate the file")
	fs.Parse(args)
	if *bucket == "" || *keyStr == "" {
		log.Fatal("--bucket and --key are required")
	}

	key, err := parseKey(*keyStr, *keyHex)
	must(err)

	valBytes, err := readValue(*value, *valueFile, *valueStdin, *valueHex)
	must(err)

	db := mustPair(openDB(path, false))
	defer db.Close()

	must(db.Update(func(tx *bolt.Tx) error {
		b := tx.Bucket([]byte(*bucket))
		if b == nil {
			return fmt.Errorf("bucket %q does not exist", *bucket)
		}
		old := b.Get(key)
		if *apply {
			must(b.Put(key, valBytes))
			if old == nil {
				fmt.Printf("PUT %s[%s] = %d bytes (was: missing)\n", *bucket, formatKeyForLog(key), len(valBytes))
			} else {
				fmt.Printf("PUT %s[%s] = %d bytes (was: %d bytes)\n", *bucket, formatKeyForLog(key), len(valBytes), len(old))
			}
		} else {
			preview := string(valBytes)
			if len(preview) > 200 {
				preview = preview[:200] + "..."
			}
			if old == nil {
				fmt.Printf("DRY-RUN: would PUT %s[%s] = %d bytes (key did not exist). Preview: %q\n",
					*bucket, formatKeyForLog(key), len(valBytes), preview)
			} else {
				fmt.Printf("DRY-RUN: would PUT %s[%s] = %d bytes (overwriting %d bytes). Preview: %q\n",
					*bucket, formatKeyForLog(key), len(valBytes), len(old), preview)
			}
		}
		return nil
	}))

	if !*apply {
		fmt.Println("(pass --apply to actually mutate)")
	}
}

func parseKey(s string, isHex bool) ([]byte, error) {
	if isHex {
		return hex.DecodeString(s)
	}
	return []byte(s), nil
}

func readValue(v, file string, stdin, hexMode bool) ([]byte, error) {
	srcCount := 0
	if v != "" {
		srcCount++
	}
	if file != "" {
		srcCount++
	}
	if stdin {
		srcCount++
	}
	if srcCount != 1 {
		return nil, fmt.Errorf("specify exactly one of --value, --value-file, or --value-stdin")
	}

	var raw []byte
	switch {
	case v != "":
		raw = []byte(v)
	case file != "":
		data, err := os.ReadFile(file)
		if err != nil {
			return nil, fmt.Errorf("read %s: %w", file, err)
		}
		raw = data
	case stdin:
		data, err := io.ReadAll(os.Stdin)
		if err != nil {
			return nil, fmt.Errorf("read stdin: %w", err)
		}
		raw = data
	}

	if hexMode {
		decoded, err := hex.DecodeString(string(raw))
		if err != nil {
			return nil, fmt.Errorf("hex decode: %w", err)
		}
		return decoded, nil
	}
	return raw, nil
}

func formatKeyForLog(k []byte) string {
	if isPrintableASCII(k) {
		return fmt.Sprintf("%q", string(k))
	}
	return fmt.Sprintf("0x%x", k)
}

// ---------- delete-session ----------

func runDeleteSession(path string, args []string) {
	fs := flag.NewFlagSet("delete-session", flag.ExitOnError)
	code := fs.String("code", "", "session code to delete (required)")
	apply := fs.Bool("apply", false, "actually mutate the file")
	fs.Parse(args)
	if *code == "" {
		log.Fatal("--code is required")
	}

	db := mustPair(openDB(path, false))
	defer db.Close()

	must(db.Update(func(tx *bolt.Tx) error {
		b := tx.Bucket([]byte(bSessions))
		existing := b.Get([]byte(*code))
		if existing == nil {
			return fmt.Errorf("session %q not found", *code)
		}
		var s struct {
			Code   string `json:"code"`
			UserID uint64 `json:"user_id"`
		}
		must(json.Unmarshal(existing, &s))
		if *apply {
			must(b.Delete([]byte(*code)))
			fmt.Printf("DELETED session %q (user_id=%d)\n", *code, s.UserID)
		} else {
			fmt.Printf("DRY-RUN: would delete session %q (user_id=%d)\n", *code, s.UserID)
		}
		return nil
	}))

	if !*apply {
		fmt.Println("(pass --apply to actually mutate)")
	}
}

// ---------- delete-sessions ----------

func runDeleteSessions(path string, args []string) {
	fs := flag.NewFlagSet("delete-sessions", flag.ExitOnError)
	userID := fs.Uint64("user", 0, "delete all sessions for this user_id")
	all := fs.Bool("all", false, "delete ALL sessions")
	code := fs.String("code", "", "delete a single session by code (alternative to --user/--all)")
	apply := fs.Bool("apply", false, "actually mutate the file")
	fs.Parse(args)

	if *userID == 0 && !*all && *code == "" {
		log.Fatal("one of --user, --all, or --code is required")
	}
	if (*userID != 0 || *all) && *code != "" {
		log.Fatal("--code is mutually exclusive with --user/--all")
	}

	db := mustPair(openDB(path, false))
	defer db.Close()

	var matched, applied int
	must(db.Update(func(tx *bolt.Tx) error {
		b := tx.Bucket([]byte(bSessions))
		return b.ForEach(func(k, v []byte) error {
			var s struct {
				Code   string `json:"code"`
				UserID uint64 `json:"user_id"`
			}
			if err := json.Unmarshal(v, &s); err != nil {
				return fmt.Errorf("bad session record for key %x: %w", k, err)
			}
			match := *all ||
				(*userID != 0 && s.UserID == *userID) ||
				(*code != "" && s.Code == *code)
			if !match {
				return nil
			}
			matched++
			if *apply {
				if err := b.Delete(k); err != nil {
					return err
				}
				applied++
				fmt.Printf("DELETED session %q (user_id=%d)\n", s.Code, s.UserID)
			} else {
				fmt.Printf("DRY-RUN: would delete session %q (user_id=%d)\n", s.Code, s.UserID)
			}
			return nil
		})
	}))

	fmt.Printf("\nmatched=%d, deleted=%d\n", matched, applied)
	if !*apply {
		fmt.Println("(pass --apply to actually mutate)")
	}
}

// ---------- delete-user (cascade) ----------

func runDeleteUser(path string, args []string) {
	fs := flag.NewFlagSet("delete-user", flag.ExitOnError)
	userID := fs.Uint64("id", 0, "user_id to delete (required)")
	apply := fs.Bool("apply", false, "actually mutate the file")
	fs.Parse(args)
	if *userID == 0 {
		log.Fatal("--id is required")
	}

	db := mustPair(openDB(path, false))
	defer db.Close()

	plan := cascadePlan{}
	var username string
	totals := cascadeTotals{}

	must(db.Update(func(tx *bolt.Tx) error {
		// Resolve username first so we can clean up users_by_username.
		users := tx.Bucket([]byte(bUsers))
		raw := users.Get(itob(*userID))
		if raw == nil {
			return fmt.Errorf("user_id=%d not found in %s", *userID, bUsers)
		}
		var u struct {
			ID       uint64 `json:"id"`
			Username string `json:"username"`
		}
		must(json.Unmarshal(raw, &u))
		username = u.Username

		plan = buildCascadePlan(tx, *userID)
		if !*apply {
			printPlan(*userID, username, plan)
			fmt.Println("\n(pass --apply to actually mutate)")
			return nil
		}
		return applyCascade(tx, *userID, username, plan, &totals)
	}))

	if *apply {
		fmt.Printf("\nUser %d (%q) deleted. Cascade totals: sessions=%d transactions=%d txn_tags=%d photos=%d sharing_tokens=%d connections_initiated=%d connections_received=%d\n",
			*userID, username, totals.sessions, totals.transactions, totals.txnTags, totals.photos, totals.tokens, totals.connsInit, totals.connsRecv)
	}
}

type cascadeTotals struct {
	sessions     int
	transactions int
	txnTags      int
	photos       int
	tokens       int
	connsInit    int
	connsRecv    int
}

// cascadePlan is the precomputed set of keys to delete, so the apply
// step is a single pass with no surprises.
type cascadePlan struct {
	sessions     [][]byte
	transactions [][]byte
	txnByUser    [][]byte
	txnTags      [][]byte
	txnPhotos    [][]byte
	photosByPath [][]byte
	tokens       [][]byte
	tokensByU    [][]byte
	connsInit    [][]byte
	connsRecv    [][]byte
}

func buildCascadePlan(tx *bolt.Tx, userID uint64) cascadePlan {
	p := cascadePlan{}

	// Collect owned transaction IDs up front; used by txn_tags, txn_photos
	// and photos_by_path to walk through the join tables.
	var ownedTxnIDs []uint64

	// transactions
	txB := tx.Bucket([]byte(bTransactions))
	_ = txB.ForEach(func(k, v []byte) error {
		var t struct {
			ID     uint64 `json:"id"`
			UserID uint64 `json:"user_id"`
		}
		if err := json.Unmarshal(v, &t); err != nil {
			return err
		}
		if t.UserID == userID {
			p.transactions = append(p.transactions, append([]byte{}, k...))
			ownedTxnIDs = append(ownedTxnIDs, t.ID)
		}
		return nil
	})

	// txn_by_user_time: prefix itob(userID)
	idxB := tx.Bucket([]byte(bTxnByUserTime))
	prefix := itob(userID)
	c := idxB.Cursor()
	for k, _ := c.Seek(prefix); k != nil && hasPrefix(k, prefix); k, _ = c.Next() {
		p.txnByUser = append(p.txnByUser, append([]byte{}, k...))
	}

	// txn_tags: keys are itob(txnID) | itob(tagID). For each owned txn, scan
	// the prefix range to find the join rows.
	tagsB := tx.Bucket([]byte(bTxnTags))
	for _, txnID := range ownedTxnIDs {
		tagPrefix := itob(txnID)
		tc := tagsB.Cursor()
		for k, _ := tc.Seek(tagPrefix); k != nil && hasPrefix(k, tagPrefix); k, _ = tc.Next() {
			p.txnTags = append(p.txnTags, append([]byte{}, k...))
		}
	}

	// txn_photos: keyed by photo_id; value carries transaction_id. For each
	// owned txn, find the photo records (full scan of txn_photos per txn,
	// but the table is small).
	photosB := tx.Bucket([]byte(bTxnPhotos))
	for _, txnID := range ownedTxnIDs {
		_ = photosB.ForEach(func(k, v []byte) error {
			var ph struct {
				ID            uint64 `json:"id"`
				TransactionID uint64 `json:"transaction_id"`
				FilePath      string `json:"file_path"`
			}
			if err := json.Unmarshal(v, &ph); err != nil {
				return err
			}
			if ph.TransactionID == txnID {
				p.txnPhotos = append(p.txnPhotos, append([]byte{}, k...))
				if ph.FilePath != "" {
					p.photosByPath = append(p.photosByPath, []byte(ph.FilePath))
				}
			}
			return nil
		})
	}

	// sessions
	sessB := tx.Bucket([]byte(bSessions))
	_ = sessB.ForEach(func(k, v []byte) error {
		var s struct {
			UserID uint64 `json:"user_id"`
		}
		if err := json.Unmarshal(v, &s); err != nil {
			return err
		}
		if s.UserID == userID {
			p.sessions = append(p.sessions, append([]byte{}, k...))
		}
		return nil
	})

	// sharing_tokens
	tokB := tx.Bucket([]byte(bSharingTokens))
	_ = tokB.ForEach(func(k, v []byte) error {
		var t struct {
			UserID uint64 `json:"user_id"`
		}
		if err := json.Unmarshal(v, &t); err != nil {
			return err
		}
		if t.UserID == userID {
			p.tokens = append(p.tokens, append([]byte{}, k...))
		}
		return nil
	})

	// sharing_tokens_by_user: prefix itob(userID)
	tbuB := tx.Bucket([]byte(bSharingTokensByU))
	tbuC := tbuB.Cursor()
	for k, _ := tbuC.Seek(prefix); k != nil && hasPrefix(k, prefix); k, _ = tbuC.Next() {
		p.tokensByU = append(p.tokensByU, append([]byte{}, k...))
	}

	// user_connections: prefix itob(userID) (this user initiated)
	connB := tx.Bucket([]byte(bUserConnections))
	connC := connB.Cursor()
	for k, _ := connC.Seek(prefix); k != nil && hasPrefix(k, prefix); k, _ = connC.Next() {
		p.connsInit = append(p.connsInit, append([]byte{}, k...))
	}

	// subscriptions_by_user: suffix itob(userID) (others subscribed to this user).
	// Key layout: itob(connected_user) | itob(subscriber_user). We want every
	// entry whose last 8 bytes == itob(userID). Full scan, but small.
	subB := tx.Bucket([]byte(bSubscriptionsByU))
	suffix := itob(userID)
	_ = subB.ForEach(func(k, _ []byte) error {
		if len(k) >= 8 && bytesEqual(k[len(k)-8:], suffix) {
			p.connsRecv = append(p.connsRecv, append([]byte{}, k...))
		}
		return nil
	})

	return p
}

func applyCascade(tx *bolt.Tx, userID uint64, username string, p cascadePlan, d *cascadeTotals) error {
	for _, k := range p.sessions {
		if err := tx.Bucket([]byte(bSessions)).Delete(k); err != nil {
			return err
		}
		d.sessions++
	}
	for _, k := range p.transactions {
		if err := tx.Bucket([]byte(bTransactions)).Delete(k); err != nil {
			return err
		}
		d.transactions++
	}
	for _, k := range p.txnByUser {
		if err := tx.Bucket([]byte(bTxnByUserTime)).Delete(k); err != nil {
			return err
		}
	}
	for _, k := range p.txnTags {
		if err := tx.Bucket([]byte(bTxnTags)).Delete(k); err != nil {
			return err
		}
		d.txnTags++
	}
	for _, k := range p.txnPhotos {
		if err := tx.Bucket([]byte(bTxnPhotos)).Delete(k); err != nil {
			return err
		}
		d.photos++
	}
	for _, k := range p.photosByPath {
		if err := tx.Bucket([]byte(bPhotosByPath)).Delete(k); err != nil {
			return err
		}
	}
	for _, k := range p.tokens {
		if err := tx.Bucket([]byte(bSharingTokens)).Delete(k); err != nil {
			return err
		}
		d.tokens++
	}
	for _, k := range p.tokensByU {
		if err := tx.Bucket([]byte(bSharingTokensByU)).Delete(k); err != nil {
			return err
		}
	}
	for _, k := range p.connsInit {
		if err := tx.Bucket([]byte(bUserConnections)).Delete(k); err != nil {
			return err
		}
		d.connsInit++
	}
	for _, k := range p.connsRecv {
		if err := tx.Bucket([]byte(bSubscriptionsByU)).Delete(k); err != nil {
			return err
		}
		d.connsRecv++
	}
	if err := tx.Bucket([]byte(bUsers)).Delete(itob(userID)); err != nil {
		return err
	}
	if err := tx.Bucket([]byte(bUsersByUsername)).Delete([]byte(username)); err != nil {
		return err
	}
	return nil
}

func printPlan(userID uint64, username string, p cascadePlan) {
	fmt.Printf("DRY-RUN cascade plan for user_id=%d (username=%q):\n", userID, username)
	fmt.Printf("  users                       -1 (this user)\n")
	fmt.Printf("  users_by_username           -1 (%q)\n", username)
	fmt.Printf("  sessions                    -%d\n", len(p.sessions))
	fmt.Printf("  transactions                -%d\n", len(p.transactions))
	fmt.Printf("  txn_by_user_time            -%d (prefix itob(user_id))\n", len(p.txnByUser))
	fmt.Printf("  txn_tags                    -%d (joined through owned txns)\n", len(p.txnTags))
	fmt.Printf("  txn_photos                  -%d\n", len(p.txnPhotos))
	fmt.Printf("  photos_by_path              -%d\n", len(p.photosByPath))
	fmt.Printf("  sharing_tokens              -%d\n", len(p.tokens))
	fmt.Printf("  sharing_tokens_by_user      -%d (prefix)\n", len(p.tokensByU))
	fmt.Printf("  user_connections            -%d (this user initiated)\n", len(p.connsInit))
	fmt.Printf("  subscriptions_by_user       -%d (others subscribed to this user)\n", len(p.connsRecv))
	fmt.Println("\nNote: tags and settings buckets are global; not touched by user deletion.")
}

// ---------- helpers ----------

func itob(v uint64) []byte {
	b := make([]byte, 8)
	binary.BigEndian.PutUint64(b, v)
	return b
}

func hasPrefix(s, prefix []byte) bool {
	if len(s) < len(prefix) {
		return false
	}
	for i := range prefix {
		if s[i] != prefix[i] {
			return false
		}
	}
	return true
}

func bytesEqual(a, b []byte) bool {
	if len(a) != len(b) {
		return false
	}
	for i := range a {
		if a[i] != b[i] {
			return false
		}
	}
	return true
}
