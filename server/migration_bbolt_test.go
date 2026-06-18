package server

import (
	"path/filepath"
	"testing"

	"code.sirenko.ca/transaction/store"
)

func TestApplyMigrationsBboltIdempotent(t *testing.T) {
	dir := t.TempDir()
	s, err := store.Open(filepath.Join(dir, "t.db"))
	if err != nil {
		t.Fatal(err)
	}
	defer s.Close()
	if err := ApplyMigrationsBbolt(s); err != nil {
		t.Fatal(err)
	}
	// Re-run: should be a no-op.
	if err := ApplyMigrationsBbolt(s); err != nil {
		t.Fatalf("second run: %v", err)
	}
}
