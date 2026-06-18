package store

import "encoding/binary"

// itob returns the 8-byte big-endian encoding of v. Used as a fixed-width
// prefix in composite bbolt keys so lexicographic order matches numeric order.
func itob(v uint64) []byte {
	b := make([]byte, 8)
	binary.BigEndian.PutUint64(b, v)
	return b
}

// btoi is the inverse of itob. Panics on input shorter than 8 bytes —
// callers must only pass itob-produced or other known-good input.
func btoi(b []byte) uint64 {
	return binary.BigEndian.Uint64(b)
}
