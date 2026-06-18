package store

import (
	"encoding/json"
	"testing"
)

func TestSettings(t *testing.T) {
	s := newTestStore(t)
	if err := s.SetSetting("a", json.RawMessage(`{"x":1}`)); err != nil {
		t.Fatal(err)
	}
	v, err := s.GetSetting("a")
	if err != nil {
		t.Fatal(err)
	}
	if string(v) != `{"x":1}` {
		t.Errorf("got %s", v)
	}
}
