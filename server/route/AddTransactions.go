package route

import (
	"encoding/json"
	"log"
	"net/http"
)

type AddTransactionPayload struct {
	Amount     float64  `json:"amount"`
	Currency   string   `json:"currency"`
	OccurredAt string   `json:"occurredAt"`
	Merchant   string   `json:"merchant"`
	Card       string   `json:"card"`
	Category   string   `json:"category"`
	Details    *string  `json:"details"`
	Tags       []string `json:"tags"`
}

func (db WithDB) AddTransactions(w http.ResponseWriter, r *http.Request, userId int) {
	if r.Method != http.MethodPost {
		http.Error(w, "Method not allowed", http.StatusMethodNotAllowed)
		return
	}

	var payload []AddTransactionPayload
	if err := json.NewDecoder(r.Body).Decode(&payload); err != nil {
		http.Error(w, "Invalid request body", http.StatusBadRequest)
		return
	}

	tx, err := db.db.Begin()
	if err != nil {
		log.Printf("Failed to start transaction: %v", err)
		http.Error(w, "Failed to start transaction", http.StatusInternalServerError)
		return
	}
	defer tx.Rollback()

	for _, t := range payload {
		var transactionID int64
		err := tx.QueryRow(
			"INSERT INTO transactions (amount, currency, occurred_at, merchant, user_id, card, category, details) VALUES ($1, $2, $3, $4, $5, $6, $7, $8) ON CONFLICT (user_id, merchant, occurred_at, amount) DO UPDATE SET category = EXCLUDED.category, card = EXCLUDED.card, details = CASE WHEN EXCLUDED.details IS NOT NULL AND EXCLUDED.details <> '' THEN EXCLUDED.details ELSE transactions.details END RETURNING transaction_id",
			t.Amount, t.Currency, t.OccurredAt, t.Merchant, userId, t.Card, t.Category, t.Details,
		).Scan(&transactionID)
		if err != nil {
			log.Printf("Failed to insert/update transaction: %v", err)
			http.Error(w, "Failed to insert/update transaction", http.StatusInternalServerError)
			return
		}

		if len(t.Tags) > 0 {
			for _, tagName := range t.Tags {
				if tagName == "" {
					continue
				}
				var tagID int64
				err = tx.QueryRow("INSERT INTO tags (tag_name) VALUES ($1) ON CONFLICT (tag_name) DO UPDATE SET tag_name = EXCLUDED.tag_name RETURNING tag_id", tagName).Scan(&tagID)
				if err != nil {
					log.Printf("Failed to get or create tag %s: %v", tagName, err)
					http.Error(w, "Failed to get or create tag", http.StatusInternalServerError)
					return
				}

				_, err := tx.Exec("INSERT INTO transaction_tags (transaction_id, tag_id) VALUES ($1, $2) ON CONFLICT DO NOTHING", transactionID, tagID)
				if err != nil {
					log.Printf("Failed to add tag to transaction %d: %v", transactionID, err)
					http.Error(w, "Failed to add tag to transaction", http.StatusInternalServerError)
					return
				}
			}
		}
	}

	if err := tx.Commit(); err != nil {
		log.Printf("Failed to commit transaction: %v", err)
		http.Error(w, "Failed to commit transaction", http.StatusInternalServerError)
		return
	}

	w.WriteHeader(http.StatusCreated)
}
