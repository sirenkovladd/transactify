package store

import (
	"testing"
	"time"
)

func TestSessionCreateAndLookup(t *testing.T) {
	s := newTestStore(t)
	u := &User{Username: "alice", HashPassword: "h"}
	if err := s.CreateUser(u); err != nil {
		t.Fatal(err)
	}
	sess := &Session{UserID: u.ID, Code: "code-abc", Device: "test", LastIP: "127.0.0.1", LastUsed: time.Now()}
	if err := s.CreateSession(sess); err != nil {
		t.Fatal(err)
	}
	got, err := s.GetSessionByCode("code-abc")
	if err != nil {
		t.Fatal(err)
	}
	if got.UserID != u.ID {
		t.Errorf("got %+v", got)
	}
}

func TestGetSessionByCodeBumpsLastUsed(t *testing.T) {
	s := newTestStore(t)
	u := &User{Username: "alice", HashPassword: "h"}
	if err := s.CreateUser(u); err != nil {
		t.Fatal(err)
	}
	past := time.Now().Add(-time.Hour)
	sess := &Session{UserID: u.ID, Code: "c1", Device: "d", LastIP: "127.0.0.1", LastUsed: past}
	if err := s.CreateSession(sess); err != nil {
		t.Fatal(err)
	}
	got, err := s.GetSessionByCode("c1")
	if err != nil {
		t.Fatal(err)
	}
	if !got.LastUsed.After(past) {
		t.Errorf("LastUsed not bumped: was %v, got %v", past, got.LastUsed)
	}
	// Every GetSessionByCode call re-bumps, so the second read must be
	// >= the first — this also proves the write back to disk succeeds.
	again, err := s.GetSessionByCode("c1")
	if err != nil {
		t.Fatal(err)
	}
	if again.LastUsed.Before(got.LastUsed) {
		t.Errorf("LastUsed went backwards across calls: was %v, got %v", got.LastUsed, again.LastUsed)
	}
}

func TestDeleteSessionRespectsUserAndIsIdempotent(t *testing.T) {
	s := newTestStore(t)
	alice := &User{Username: "alice", HashPassword: "h"}
	if err := s.CreateUser(alice); err != nil {
		t.Fatal(err)
	}
	bob := &User{Username: "bob", HashPassword: "h"}
	if err := s.CreateUser(bob); err != nil {
		t.Fatal(err)
	}
	sess := &Session{UserID: alice.ID, Code: "c1", LastUsed: time.Now()}
	if err := s.CreateSession(sess); err != nil {
		t.Fatal(err)
	}
	if err := s.DeleteSession("c1", bob.ID); err != nil {
		t.Fatalf("unexpected error: %v", err)
	}
	if _, err := s.GetSessionByCode("c1"); err != nil {
		t.Errorf("session should still exist after wrong-user delete: %v", err)
	}
	if err := s.DeleteSession("c1", alice.ID); err != nil {
		t.Fatalf("unexpected error: %v", err)
	}
	if _, err := s.GetSessionByCode("c1"); err == nil {
		t.Error("session should be gone after owner delete")
	}
	if err := s.DeleteSession("c1", alice.ID); err != nil {
		t.Errorf("second delete should be idempotent, got: %v", err)
	}
}
