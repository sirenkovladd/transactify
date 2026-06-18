package store

import "testing"

func TestPhotoCreateAndLookupByPath(t *testing.T) {
	s := newTestStore(t)
	u := newUser(t, s, "alice")
	tx := &Transaction{UserID: u.ID, Amount: 1, Currency: "CAD", Merchant: "M"}
	if err := s.CreateTransaction(tx); err != nil {
		t.Fatal(err)
	}
	p := &Photo{TransactionID: tx.ID, FilePath: "/uploads/x.jpg"}
	if err := s.CreatePhoto(p); err != nil {
		t.Fatal(err)
	}
	got, err := s.GetPhotoByPath("/uploads/x.jpg")
	if err != nil {
		t.Fatal(err)
	}
	if got.ID != p.ID {
		t.Errorf("got %+v", got)
	}
	if err := s.DeletePhotoByPath("/uploads/x.jpg"); err != nil {
		t.Fatal(err)
	}
	if _, err := s.GetPhotoByPath("/uploads/x.jpg"); err == nil {
		t.Error("expected ErrNotFound after delete")
	}
}
