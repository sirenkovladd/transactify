package route

import (
	"errors"
	"time"
)

// parseOccurredAt parses the user-supplied occurredAt string.
//
// Two formats are accepted:
//
//  1. RFC3339 / RFC3339Nano, e.g. "2026-06-17T15:06:00Z" or
//     "2026-06-17T15:06:00.000-04:00". The import flow and any JS
//     caller using `new Date(value).toISOString()` produce this shape.
//
//  2. The raw value of an HTML <input type="datetime-local">,
//     "YYYY-MM-DDTHH:MM" (or with seconds, or with a space instead
//     of "T"). The new-transaction modal posts this shape verbatim.
//     It is interpreted in the server's local timezone, mirroring
//     what `new Date(value).toISOString()` does in the browser when
//     the server and browser share a timezone (self-hosted case).
//
// The returned time is always in UTC.
func parseOccurredAt(s string) (time.Time, error) {
	if s == "" {
		return time.Time{}, errInvalidOccurredAt
	}

	// Layouts that carry their own timezone — parsed in UTC since
	// the offset is in the string.
	for _, layout := range []string{time.RFC3339Nano, time.RFC3339} {
		if t, err := time.Parse(layout, s); err == nil {
			return t.UTC(), nil
		}
	}

	// Layouts without a timezone — parsed in the server's local
	// timezone so the wall-clock value the user typed is preserved.
	for _, layout := range []string{
		"2006-01-02T15:04:05",
		"2006-01-02T15:04",
		"2006-01-02 15:04:05",
		"2006-01-02 15:04",
	} {
		if t, err := time.ParseInLocation(layout, s, time.Local); err == nil {
			return t.UTC(), nil
		}
	}

	return time.Time{}, errInvalidOccurredAt
}

var errInvalidOccurredAt = errors.New(
	"must be RFC3339 (e.g. 2026-06-17T15:06:00Z) or datetime-local (2026-06-17T15:06)",
)
