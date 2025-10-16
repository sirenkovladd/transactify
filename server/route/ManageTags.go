package route

import (
	"encoding/json"
	"log"
	"net/http"
)

type TagPayload struct {
	TransactionIDs []int64 `json:"transaction_ids"`
	Tag            string  `json:"tag"`
	Action         string  `json:"action"` // "add" or "remove"
}

func (db WithDB) ManageTags(w http.ResponseWriter, r *http.Request, userId int) {
	if r.Method != http.MethodPost {
		http.Error(w, "Method not allowed", http.StatusMethodNotAllowed)
		return
	}

	var payload TagPayload
	if err := json.NewDecoder(r.Body).Decode(&payload); err != nil {
		http.Error(w, "Invalid request body", http.StatusBadRequest)
		return
	}

	if len(payload.TransactionIDs) == 0 || payload.Tag == "" || (payload.Action != "add" && payload.Action != "remove") {
		http.Error(w, "Invalid payload", http.StatusBadRequest)
		return
	}

	tx, err := db.db.Begin()
	if err != nil {
		http.Error(w, "Failed to start transaction", http.StatusInternalServerError)
		return
	}
	defer tx.Rollback()

	var tagID int64
	// Get or create tag ID
	err = tx.QueryRow("INSERT INTO tags (tag_name) VALUES ($1) ON CONFLICT (tag_name) DO UPDATE SET tag_name = EXCLUDED.tag_name RETURNING tag_id", payload.Tag).Scan(&tagID)
	if err != nil {
		log.Printf("Failed to get or create tag %s: %v", payload.Tag, err)
		http.Error(w, "Failed to get or create tag", http.StatusInternalServerError)
		return
	}

	if payload.Action == "add" {
		stmt, err := tx.Prepare("INSERT INTO transaction_tags (transaction_id, tag_id) VALUES ($1, $2) ON CONFLICT DO NOTHING")
		if err != nil {
			http.Error(w, "Failed to prepare statement", http.StatusInternalServerError)
			return
		}
		defer stmt.Close()

		for _, transactionID := range payload.TransactionIDs {
			_, err := stmt.Exec(transactionID, tagID)
			if err != nil {
				log.Printf("Failed to add tag to transaction %d: %v", transactionID, err)
				http.Error(w, "Failed to add tag to transaction", http.StatusInternalServerError)
				return
			}
		}
	} else if payload.Action == "remove" {
		stmt, err := tx.Prepare("DELETE FROM transaction_tags WHERE transaction_id = $1 AND tag_id = $2")
		if err != nil {
			http.Error(w, "Failed to prepare statement", http.StatusInternalServerError)
			return
		}
		defer stmt.Close()

		for _, transactionID := range payload.TransactionIDs {
			_, err := stmt.Exec(transactionID, tagID)
			if err != nil {
				log.Printf("Failed to remove tag from transaction %d: %v", transactionID, err)
				http.Error(w, "Failed to remove tag from transaction", http.StatusInternalServerError)
				return
			}
		}
	}

	if err := tx.Commit(); err != nil {
		http.Error(w, "Failed to commit transaction", http.StatusInternalServerError)
		return
	}

	w.WriteHeader(http.StatusOK)
}
