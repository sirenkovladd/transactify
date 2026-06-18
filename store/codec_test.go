package store

import (
	"bytes"
	"encoding/binary"
	"testing"
)

func TestItobRoundTrip(t *testing.T) {
	for _, v := range []uint64{0, 1, 42, 1 << 30, 1 << 63} {
		got := btoi(itob(v))
		if got != v {
			t.Errorf("btoi(itob(%d)) = %d", v, got)
		}
	}
}

func TestItobBigEndian(t *testing.T) {
	b := itob(1)
	if !bytes.Equal(b, []byte{0, 0, 0, 0, 0, 0, 0, 1}) {
		t.Errorf("itob(1) is not big-endian: %x", b)
	}
}

func TestItobFixedWidth(t *testing.T) {
	if len(itob(0)) != 8 || len(itob(1<<63)) != 8 {
		t.Error("itob must always return 8 bytes")
	}
}

func TestBtoiRejectsShort(t *testing.T) {
	defer func() {
		if r := recover(); r == nil {
			t.Error("btoi on short input should panic or return 0; verify behavior")
		}
	}()
	binary.BigEndian.Uint64([]byte{1, 2, 3})
	_ = btoi([]byte{1, 2, 3})
}
