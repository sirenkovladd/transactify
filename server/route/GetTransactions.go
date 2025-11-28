package route

import (
	"crypto/md5"
	"encoding/json"
	"fmt"
	"log"
	"net/http"
	"path/filepath"
	"strings"

	"strconv"

	"code.sirenko.ca/transaction/src"
)

type Transaction struct {
	ID         int64    `json:"id"`
	Amount     float64  `json:"amount"`
	Currency   string   `json:"currency"`
	OccurredAt string   `json:"occurredAt"`
	Merchant   string   `json:"merchant"`
	PersonName string   `json:"personName"`
	Card       string   `json:"card"`
	Category   string   `json:"category"`
	Details    *string  `json:"details"`
	Tags       []string `json:"tags"`
	Photos     []string `json:"photos"`
}

func (db WithDB) GetTransactions(w http.ResponseWriter, r *http.Request, userId int) {
	if r.Method != http.MethodGet {
		http.Error(w, "Method not allowed", http.StatusMethodNotAllowed)
		return
	}

	rows, err := db.db.Query(`
		SELECT
			t.transaction_id, t.amount, t.currency, t.occurred_at, t.merchant, u.person_name, t.card, t.category, t.details,
			COALESCE(STRING_AGG(DISTINCT tags.tag_name, ',' ORDER BY tags.tag_name), '') AS tags,
			COALESCE(STRING_AGG(DISTINCT tp.file_path, ','), '') AS photos
		FROM transactions t
		JOIN users u ON t.user_id = u.user_id
		LEFT JOIN transaction_tags ON t.transaction_id = transaction_tags.transaction_id
		LEFT JOIN tags ON transaction_tags.tag_id = tags.tag_id
		LEFT JOIN transaction_photos tp ON t.transaction_id = tp.transaction_id
		WHERE t.user_id = $1 OR t.user_id IN (SELECT connected_user_id FROM user_connections WHERE user_id = $1)
		GROUP BY t.transaction_id, u.person_name
		ORDER BY t.occurred_at DESC
	`, userId)
	if err != nil {
		log.Printf("Error querying database: %v", err)
		http.Error(w, "Failed to query database", http.StatusInternalServerError)
		return
	}
	defer rows.Close()

	var transactions []Transaction
	for rows.Next() {
		var t Transaction
		var tags string
		var photos string
		err := rows.Scan(&t.ID, &t.Amount, &t.Currency, &t.OccurredAt, &t.Merchant, &t.PersonName, &t.Card, &t.Category, &t.Details, &tags, &photos)
		if err != nil {
			log.Printf("Error scanning row: %v", err)
			http.Error(w, "Failed to scan row", http.StatusInternalServerError)
			return
		}
		if tags != "" {
			t.Tags = strings.Split(tags, ",")
		} else {
			t.Tags = []string{}
		}
		if photos != "" {
			photoPaths := strings.Split(photos, ",")
			encryptedUserId, err := src.Encrypt(strconv.Itoa(userId))
			if err != nil {
				log.Printf("Error encrypting user ID: %v", err)
				http.Error(w, "Internal server error", http.StatusInternalServerError)
				return
			}
			encryptedTransactionId, err := src.Encrypt(strconv.FormatInt(t.ID, 10))
			if err != nil {
				log.Printf("Error encrypting transaction ID: %v", err)
				http.Error(w, "Internal server error", http.StatusInternalServerError)
				return
			}
			for i, p := range photoPaths {
				photoPaths[i] = "/uploads/transaction/" + encryptedUserId + "/" + encryptedTransactionId + "/" + filepath.Base(p)
			}
			t.Photos = photoPaths
		} else {
			t.Photos = []string{}
		}
		transactions = append(transactions, t)
	}
	// Serialize transactions to JSON
	data, err := json.Marshal(transactions)
	if err != nil {
		log.Printf("Error marshaling transactions: %v", err)
		http.Error(w, "Internal server error", http.StatusInternalServerError)
		return
	}

	// Calculate ETag
	hash := md5.Sum(data)
	etag := fmt.Sprintf(`"%x"`, hash)

	// Check If-None-Match header
	if match := r.Header.Get("If-None-Match"); match == etag {
		w.WriteHeader(http.StatusNotModified)
		return
	}

	w.Header().Set("Content-Type", "application/json")
	w.Header().Set("ETag", etag)
	w.Write(data)
}
