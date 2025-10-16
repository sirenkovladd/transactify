package route

import (
	"encoding/json"
	"log"
	"net/http"
	"strings"
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
}

func (db WithDB) GetTransactions(w http.ResponseWriter, r *http.Request, userId int) {
	if r.Method != http.MethodGet {
		http.Error(w, "Method not allowed", http.StatusMethodNotAllowed)
		return
	}

	rows, err := db.db.Query(`
		SELECT
			t.transaction_id, t.amount, t.currency, t.occurred_at, t.merchant, u.person_name, t.card, t.category, t.details,
			COALESCE(STRING_AGG(tags.tag_name, ',' ORDER BY tags.tag_name), '') AS tags
		FROM transactions t
		JOIN users u ON t.user_id = u.user_id
		LEFT JOIN transaction_tags ON t.transaction_id = transaction_tags.transaction_id
		LEFT JOIN tags ON transaction_tags.tag_id = tags.tag_id
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
		err := rows.Scan(&t.ID, &t.Amount, &t.Currency, &t.OccurredAt, &t.Merchant, &t.PersonName, &t.Card, &t.Category, &t.Details, &tags)
		if tags != "" {
			t.Tags = strings.Split(tags, ",")
		} else {
			t.Tags = []string{}
		}
		if err != nil {
			log.Printf("Error scanning row: %v", err)
			http.Error(w, "Failed to scan row", http.StatusInternalServerError)
			return
		}
		transactions = append(transactions, t)
	}
	http.Header.Add(w.Header(), "Content-Type", "application/json")
	err = json.NewEncoder(w).Encode(transactions)
	if err != nil {
		log.Fatal(err)
	}
}
