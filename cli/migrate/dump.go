// Package main implements a one-shot CLI that copies all data from a
// PostgreSQL instance into a fresh bbolt file. It is part of the
// migration plan documented at
// docs/superpowers/plans/2026-06-17-migrate-postgres-to-bbolt.md.
package main

import (
	"database/sql"
	"time"
)

// dumpUsers mirrors the columns of public.users we care about. We don't
// pull in the public schema as a Go type because the migrate CLI is
// intentionally decoupled from the store package — it has to work even
// before the rest of the migration is in place.
type dumpUsers struct {
	ID           uint64
	Username     string
	HashPassword string
	PersonName   string
	OTPEnabled   string
}

func dumpAllUsers(db *sql.DB) ([]dumpUsers, error) {
	rows, err := db.Query(`SELECT user_id, username, hash_password,
		COALESCE(person_name, ''), COALESCE(otp_enabled, '')
		FROM users ORDER BY user_id`)
	if err != nil {
		return nil, err
	}
	defer rows.Close()
	var out []dumpUsers
	for rows.Next() {
		var u dumpUsers
		if err := rows.Scan(&u.ID, &u.Username, &u.HashPassword, &u.PersonName, &u.OTPEnabled); err != nil {
			return nil, err
		}
		out = append(out, u)
	}
	return out, rows.Err()
}

type dumpSessions struct {
	UserID   uint64
	Code     string
	Device   string
	LastIP   string
	LastUsed time.Time
}

func dumpAllSessions(db *sql.DB) ([]dumpSessions, error) {
	rows, err := db.Query(`SELECT user_id, session_code,
		COALESCE(device, ''), COALESCE(last_ip, ''), last_used
		FROM sessions`)
	if err != nil {
		return nil, err
	}
	defer rows.Close()
	var out []dumpSessions
	for rows.Next() {
		var s dumpSessions
		if err := rows.Scan(&s.UserID, &s.Code, &s.Device, &s.LastIP, &s.LastUsed); err != nil {
			return nil, err
		}
		out = append(out, s)
	}
	return out, rows.Err()
}

type dumpTags struct {
	ID   uint64
	Name string
}

func dumpAllTags(db *sql.DB) ([]dumpTags, error) {
	rows, err := db.Query(`SELECT tag_id, tag_name FROM tags ORDER BY tag_id`)
	if err != nil {
		return nil, err
	}
	defer rows.Close()
	var out []dumpTags
	for rows.Next() {
		var t dumpTags
		if err := rows.Scan(&t.ID, &t.Name); err != nil {
			return nil, err
		}
		out = append(out, t)
	}
	return out, rows.Err()
}

type dumpTransactions struct {
	ID         uint64
	UserID     uint64
	Amount     float64
	Currency   string
	OccurredAt time.Time
	Merchant   string
	Card       string
	Category   string
	Details    string
}

func dumpAllTransactions(db *sql.DB) ([]dumpTransactions, error) {
	rows, err := db.Query(`SELECT transaction_id, user_id, amount, currency,
		occurred_at, merchant,
		COALESCE(card, ''), COALESCE(category, ''), COALESCE(details, '')
		FROM transactions ORDER BY transaction_id`)
	if err != nil {
		return nil, err
	}
	defer rows.Close()
	var out []dumpTransactions
	for rows.Next() {
		var t dumpTransactions
		if err := rows.Scan(&t.ID, &t.UserID, &t.Amount, &t.Currency,
			&t.OccurredAt, &t.Merchant, &t.Card, &t.Category, &t.Details); err != nil {
			return nil, err
		}
		out = append(out, t)
	}
	return out, rows.Err()
}

type dumpTxnTags struct {
	TxnID uint64
	TagID uint64
}

func dumpAllTxnTags(db *sql.DB) ([]dumpTxnTags, error) {
	rows, err := db.Query(`SELECT transaction_id, tag_id FROM transaction_tags`)
	if err != nil {
		return nil, err
	}
	defer rows.Close()
	var out []dumpTxnTags
	for rows.Next() {
		var x dumpTxnTags
		if err := rows.Scan(&x.TxnID, &x.TagID); err != nil {
			return nil, err
		}
		out = append(out, x)
	}
	return out, rows.Err()
}

type dumpPhotos struct {
	ID            uint64
	TransactionID uint64
	FilePath      string
	CreatedAt     time.Time
}

func dumpAllPhotos(db *sql.DB) ([]dumpPhotos, error) {
	rows, err := db.Query(`SELECT photo_id, transaction_id, file_path, created_at
		FROM transaction_photos ORDER BY photo_id`)
	if err != nil {
		return nil, err
	}
	defer rows.Close()
	var out []dumpPhotos
	for rows.Next() {
		var p dumpPhotos
		if err := rows.Scan(&p.ID, &p.TransactionID, &p.FilePath, &p.CreatedAt); err != nil {
			return nil, err
		}
		out = append(out, p)
	}
	return out, rows.Err()
}

type dumpTokens struct {
	ID        uint64
	UserID    uint64
	Token     string
	CreatedAt time.Time
}

func dumpAllTokens(db *sql.DB) ([]dumpTokens, error) {
	rows, err := db.Query(`SELECT token_id, user_id, token, created_at
		FROM sharing_tokens ORDER BY token_id`)
	if err != nil {
		return nil, err
	}
	defer rows.Close()
	var out []dumpTokens
	for rows.Next() {
		var t dumpTokens
		if err := rows.Scan(&t.ID, &t.UserID, &t.Token, &t.CreatedAt); err != nil {
			return nil, err
		}
		out = append(out, t)
	}
	return out, rows.Err()
}

type dumpConnections struct {
	UserID        uint64
	ConnectedUser uint64
	CreatedAt     time.Time
}

func dumpAllConnections(db *sql.DB) ([]dumpConnections, error) {
	rows, err := db.Query(`SELECT user_id, connected_user_id, created_at FROM user_connections`)
	if err != nil {
		return nil, err
	}
	defer rows.Close()
	var out []dumpConnections
	for rows.Next() {
		var c dumpConnections
		if err := rows.Scan(&c.UserID, &c.ConnectedUser, &c.CreatedAt); err != nil {
			return nil, err
		}
		out = append(out, c)
	}
	return out, rows.Err()
}

type dumpSettings struct {
	Key       string
	Value     []byte
	UpdatedAt time.Time
}

func dumpAllSettings(db *sql.DB) ([]dumpSettings, error) {
	rows, err := db.Query(`SELECT key, value, COALESCE(updated_at, now()) FROM settings`)
	if err != nil {
		return nil, err
	}
	defer rows.Close()
	var out []dumpSettings
	for rows.Next() {
		var s dumpSettings
		if err := rows.Scan(&s.Key, &s.Value, &s.UpdatedAt); err != nil {
			return nil, err
		}
		out = append(out, s)
	}
	return out, rows.Err()
}
