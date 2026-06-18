package store

import "testing"

func TestTokenAndConnection(t *testing.T) {
	s := newTestStore(t)
	a := newUser(t, s, "alice")
	b := newUser(t, s, "bob")
	if err := s.CreateToken("tok-1", a.ID); err != nil {
		t.Fatal(err)
	}
	owner, err := s.GetTokenOwner("tok-1")
	if err != nil {
		t.Fatal(err)
	}
	if owner != a.ID {
		t.Errorf("expected %d, got %d", a.ID, owner)
	}
	tokens, _ := s.ListTokensForUser(a.ID)
	if len(tokens) != 1 || tokens[0] != "tok-1" {
		t.Errorf("got %v", tokens)
	}
	if err := s.AddConnection(b.ID, a.ID); err != nil {
		t.Fatal(err)
	}
	conns, _ := s.ListConnectedUserIDs(b.ID)
	if len(conns) != 1 || conns[0] != a.ID {
		t.Errorf("got %v", conns)
	}
	subs, _ := s.ListSubscribers(a.ID)
	if len(subs) != 1 || subs[0] != b.ID {
		t.Errorf("got %v", subs)
	}
	if err := s.RevokeToken("tok-1", a.ID); err != nil {
		t.Fatal(err)
	}
	if _, err := s.GetTokenOwner("tok-1"); err == nil {
		t.Error("expected ErrNotFound after revoke")
	}
}
