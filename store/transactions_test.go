package store

import (
	"testing"
	"time"
)

func newUser(t *testing.T, s *Store, name string) *User {
	t.Helper()
	u := &User{Username: name, HashPassword: "h"}
	if err := s.CreateUser(u); err != nil {
		t.Fatal(err)
	}
	return u
}

func TestTransactionCreateAndList(t *testing.T) {
	s := newTestStore(t)
	u := newUser(t, s, "alice")
	t1 := &Transaction{UserID: u.ID, Amount: 10, Currency: "CAD", Merchant: "M1", OccurredAt: time.Now().Add(-time.Hour)}
	t2 := &Transaction{UserID: u.ID, Amount: 20, Currency: "CAD", Merchant: "M2", OccurredAt: time.Now()}
	if err := s.CreateTransaction(t1); err != nil {
		t.Fatal(err)
	}
	if err := s.CreateTransaction(t2); err != nil {
		t.Fatal(err)
	}
	got, err := s.ListTransactionsForUser(u.ID)
	if err != nil {
		t.Fatal(err)
	}
	if len(got) != 2 {
		t.Fatalf("expected 2, got %d", len(got))
	}
	// DESC by occurred_at: t2 first.
	if got[0].ID != t2.ID {
		t.Errorf("expected newest first")
	}
}

func TestDeleteTransactionRespectsOwner(t *testing.T) {
	s := newTestStore(t)
	a := newUser(t, s, "alice")
	b := newUser(t, s, "bob")
	tx := &Transaction{UserID: a.ID, Amount: 10, Currency: "CAD", Merchant: "M", OccurredAt: time.Now()}
	if err := s.CreateTransaction(tx); err != nil {
		t.Fatal(err)
	}
	deleted, err := s.DeleteTransaction(tx.ID, b.ID)
	if err != nil {
		t.Fatal(err)
	}
	if deleted {
		t.Error("bob should not be able to delete alice's transaction")
	}
	deleted, err = s.DeleteTransaction(tx.ID, a.ID)
	if err != nil {
		t.Fatal(err)
	}
	if !deleted {
		t.Error("alice should be able to delete her own transaction")
	}
}

func TestUpdateTransactionRewritesIndex(t *testing.T) {
	s := newTestStore(t)
	u := newUser(t, s, "alice")
	base := time.Now()
	tx := &Transaction{UserID: u.ID, Amount: 1, Currency: "CAD", Merchant: "M", OccurredAt: base}
	if err := s.CreateTransaction(tx); err != nil {
		t.Fatal(err)
	}
	// Move the transaction 1 hour into the future.
	tx.OccurredAt = base.Add(time.Hour)
	if err := s.UpdateTransaction(tx); err != nil {
		t.Fatal(err)
	}
	// After update, the transaction should be the only one and should
	// be at the new time. ListTransactionsForUser returns DESC, so the
	// single result should match the new time.
	got, err := s.ListTransactionsForUser(u.ID)
	if err != nil {
		t.Fatal(err)
	}
	if len(got) != 1 {
		t.Fatalf("expected 1, got %d", len(got))
	}
	if !got[0].OccurredAt.Equal(base.Add(time.Hour)) {
		t.Errorf("expected new time, got %v", got[0].OccurredAt)
	}
}
