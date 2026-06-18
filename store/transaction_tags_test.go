package store

import "testing"

func TestAddAndListTags(t *testing.T) {
	s := newTestStore(t)
	u := newUser(t, s, "alice")
	a, _ := s.GetOrCreateTag("a")
	b, _ := s.GetOrCreateTag("b")
	tx := &Transaction{UserID: u.ID, Amount: 1, Currency: "CAD", Merchant: "M"}
	if err := s.CreateTransaction(tx); err != nil {
		t.Fatal(err)
	}
	if err := s.AddTagToTransaction(tx.ID, a.ID); err != nil {
		t.Fatal(err)
	}
	if err := s.AddTagToTransaction(tx.ID, b.ID); err != nil {
		t.Fatal(err)
	}
	names, err := s.ListTagsForTransaction(tx.ID)
	if err != nil {
		t.Fatal(err)
	}
	if len(names) != 2 || names[0] != "a" || names[1] != "b" {
		t.Errorf("got %v", names)
	}
}

func TestReplaceTagsForTransaction(t *testing.T) {
	s := newTestStore(t)
	u := newUser(t, s, "alice")
	tx := &Transaction{UserID: u.ID, Amount: 1, Currency: "CAD", Merchant: "M"}
	if err := s.CreateTransaction(tx); err != nil {
		t.Fatal(err)
	}
	// Start with ["a", "b"].
	if err := s.ReplaceTagsForTransaction(tx.ID, []string{"a", "b"}); err != nil {
		t.Fatal(err)
	}
	got, _ := s.ListTagsForTransaction(tx.ID)
	if len(got) != 2 || got[0] != "a" || got[1] != "b" {
		t.Fatalf("after initial set: got %v", got)
	}
	// Replace with ["b", "c"]: drop "a", add "c".
	if err := s.ReplaceTagsForTransaction(tx.ID, []string{"b", "c"}); err != nil {
		t.Fatal(err)
	}
	got, _ = s.ListTagsForTransaction(tx.ID)
	if len(got) != 2 || got[0] != "b" || got[1] != "c" {
		t.Errorf("after replace: got %v", got)
	}
	// Idempotent: replace with the same set.
	if err := s.ReplaceTagsForTransaction(tx.ID, []string{"b", "c"}); err != nil {
		t.Fatal(err)
	}
	got, _ = s.ListTagsForTransaction(tx.ID)
	if len(got) != 2 {
		t.Errorf("after idempotent replace: got %v", got)
	}
}

func TestDeleteTransactionCascadesToTags(t *testing.T) {
	s := newTestStore(t)
	u := newUser(t, s, "alice")
	tx := &Transaction{UserID: u.ID, Amount: 1, Currency: "CAD", Merchant: "M"}
	if err := s.CreateTransaction(tx); err != nil {
		t.Fatal(err)
	}
	if err := s.ReplaceTagsForTransaction(tx.ID, []string{"a", "b"}); err != nil {
		t.Fatal(err)
	}
	// Sanity: tags are linked.
	if got, _ := s.ListTagsForTransaction(tx.ID); len(got) != 2 {
		t.Fatalf("setup: expected 2 tags, got %v", got)
	}
	deleted, err := s.DeleteTransaction(tx.ID, u.ID)
	if err != nil {
		t.Fatal(err)
	}
	if !deleted {
		t.Fatal("expected deletion to succeed")
	}
	// Tags should be gone.
	got, _ := s.ListTagsForTransaction(tx.ID)
	if len(got) != 0 {
		t.Errorf("expected 0 tags after delete, got %v", got)
	}
}
