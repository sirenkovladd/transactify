package store

import (
	"path/filepath"
	"testing"
)

func newTestStore(t *testing.T) *Store {
	t.Helper()
	s, err := Open(filepath.Join(t.TempDir(), "t.db"))
	if err != nil {
		t.Fatal(err)
	}
	if err := s.Init(); err != nil {
		t.Fatal(err)
	}
	t.Cleanup(func() { s.Close() })
	return s
}

func TestUserCreateAndLookup(t *testing.T) {
	s := newTestStore(t)
	u := &User{Username: "alice", HashPassword: "hash", PersonName: "Alice"}
	if err := s.CreateUser(u); err != nil {
		t.Fatal(err)
	}
	if u.ID == 0 {
		t.Fatal("CreateUser must assign ID")
	}
	got, err := s.GetUserByUsername("alice")
	if err != nil {
		t.Fatal(err)
	}
	if got.ID != u.ID || got.PersonName != "Alice" {
		t.Errorf("got %+v", got)
	}
}

func TestGetUserByUsernameMissing(t *testing.T) {
	s := newTestStore(t)
	if _, err := s.GetUserByUsername("nobody"); err == nil {
		t.Error("expected ErrNotFound")
	}
}

func TestCreateUserRejectsDuplicate(t *testing.T) {
	s := newTestStore(t)
	u := &User{Username: "alice", HashPassword: "h"}
	if err := s.CreateUser(u); err != nil {
		t.Fatal(err)
	}
	dup := &User{Username: "alice", HashPassword: "other", PersonName: "Other"}
	if err := s.CreateUser(dup); err == nil {
		t.Error("expected error on duplicate username")
	}
}
