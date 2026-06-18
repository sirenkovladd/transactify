package store

import "testing"

func TestGetOrCreateTag(t *testing.T) {
	s := newTestStore(t)
	a, err := s.GetOrCreateTag("food")
	if err != nil {
		t.Fatal(err)
	}
	if a.ID == 0 {
		t.Fatal("ID should be assigned")
	}
	b, err := s.GetOrCreateTag("food")
	if err != nil {
		t.Fatal(err)
	}
	if a.ID != b.ID {
		t.Errorf("second call should return same tag: %d vs %d", a.ID, b.ID)
	}
}
