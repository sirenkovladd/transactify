package route

import (
	"testing"
	"time"
)

func TestParseOccurredAt_RFC3339(t *testing.T) {
	cases := []struct {
		name  string
		input string
		want  time.Time
	}{
		{
			name:  "zulu",
			input: "2026-06-17T15:06:00Z",
			want:  time.Date(2026, 6, 17, 15, 6, 0, 0, time.UTC),
		},
		{
			name:  "negative offset",
			input: "2026-06-17T15:06:00-04:00",
			want:  time.Date(2026, 6, 17, 19, 6, 0, 0, time.UTC),
		},
		{
			name:  "positive offset",
			input: "2026-06-17T15:06:00+02:00",
			want:  time.Date(2026, 6, 17, 13, 6, 0, 0, time.UTC),
		},
		{
			name:  "nano",
			input: "2026-06-17T15:06:00.123456789Z",
			want:  time.Date(2026, 6, 17, 15, 6, 0, 123456789, time.UTC),
		},
	}
	for _, tc := range cases {
		t.Run(tc.name, func(t *testing.T) {
			got, err := parseOccurredAt(tc.input)
			if err != nil {
				t.Fatalf("unexpected error: %v", err)
			}
			if !got.Equal(tc.want) {
				t.Errorf("got %v, want %v", got, tc.want)
			}
			if got.Location() != time.UTC {
				t.Errorf("result not in UTC: %v", got.Location())
			}
		})
	}
}

func TestParseOccurredAt_DateTimeLocal(t *testing.T) {
	// The HTML5 datetime-local form. The exact UTC instant depends
	// on the server's timezone, but the wall-clock value the user
	// typed must round-trip via time.Local.
	cases := []struct {
		name  string
		input string
	}{
		{"no seconds", "2026-06-17T15:06"},
		{"with seconds", "2026-06-17T15:06:30"},
		{"space separator", "2026-06-17 15:06"},
		{"space separator with seconds", "2026-06-17 15:06:30"},
	}
	for _, tc := range cases {
		t.Run(tc.name, func(t *testing.T) {
			got, err := parseOccurredAt(tc.input)
			if err != nil {
				t.Fatalf("unexpected error: %v", err)
			}
			if got.Location() != time.UTC {
				t.Errorf("result not in UTC: %v", got.Location())
			}
			// Convert the UTC instant back to server-local and verify
			// the wall-clock matches the typed input.
			local := got.Local()
			if local.Year() != 2026 || local.Month() != 6 || local.Day() != 17 {
				t.Errorf("date mismatch: %v", local)
			}
			if local.Hour() != 15 || local.Minute() != 6 {
				t.Errorf("time-of-day mismatch: %v (want 15:06)", local)
			}
		})
	}
}

func TestParseOccurredAt_Rejects(t *testing.T) {
	for _, in := range []string{"", "not a date", "2026/06/17 15:06", "15:06"} {
		t.Run(in, func(t *testing.T) {
			if _, err := parseOccurredAt(in); err == nil {
				t.Fatalf("expected error for %q", in)
			}
		})
	}
}
