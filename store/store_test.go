package store

import (
	"path/filepath"
	"testing"

	bolt "go.etcd.io/bbolt"
)

func TestOpenCreatesFile(t *testing.T) {
	dir := t.TempDir()
	path := filepath.Join(dir, "test.db")
	s, err := Open(path)
	if err != nil {
		t.Fatalf("Open: %v", err)
	}
	defer s.Close()
	if err := s.Init(); err != nil {
		t.Fatalf("Init: %v", err)
	}
	// Re-open and verify a known bucket exists.
	s.Close()
	s2, err := Open(path)
	if err != nil {
		t.Fatalf("reopen: %v", err)
	}
	defer s2.Close()
	if err := s2.db.View(func(tx *bolt.Tx) error {
		if tx.Bucket([]byte("users")) == nil {
			t.Error("users bucket missing after re-open")
		}
		return nil
	}); err != nil {
		t.Fatal(err)
	}
}
