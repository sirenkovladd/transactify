package route

import (
	"encoding/json"
	"log"
	"net/http"
)

type CategoryPayload struct {
	TransactionIDs []int64 `json:"transaction_ids"`
	Category       string  `json:"category"`
}

func (db WithDB) ManageCategory(w http.ResponseWriter, r *http.Request, userId int) {
	if r.Method != http.MethodPost {
		http.Error(w, "Method not allowed", http.StatusMethodNotAllowed)
		return
	}

	var payload CategoryPayload
	if err := json.NewDecoder(r.Body).Decode(&payload); err != nil {
		http.Error(w, "Invalid request body", http.StatusBadRequest)
		return
	}

	if len(payload.TransactionIDs) == 0 || payload.Category == "" {
		http.Error(w, "Invalid payload", http.StatusBadRequest)
		return
	}

	tx, err := db.db.Begin()
	if err != nil {
		http.Error(w, "Failed to start transaction", http.StatusInternalServerError)
		return
	}
	defer tx.Rollback()

	stmt, err := tx.Prepare("UPDATE transactions SET category = $1 WHERE transaction_id = $2 AND user_id = $3")
	if err != nil {
		http.Error(w, "Failed to prepare statement", http.StatusInternalServerError)
		return
	}
	defer stmt.Close()

	for _, transactionID := range payload.TransactionIDs {
		_, err := stmt.Exec(payload.Category, transactionID, userId)
		if err != nil {
			log.Printf("Failed to update category for transaction %d: %v", transactionID, err)
			http.Error(w, "Failed to update category", http.StatusInternalServerError)
			return
		}
	}

	if err := tx.Commit(); err != nil {
		http.Error(w, "Failed to commit transaction", http.StatusInternalServerError)
		return
	}

	w.WriteHeader(http.StatusOK)
}
