package route

import (
	"encoding/json"
	"log"
	"net/http"
)

type DeleteTransactionPayload struct {
	ID int64 `json:"id"`
}

func (db WithDB) DeleteTransaction(w http.ResponseWriter, r *http.Request, userId int) {
	if r.Method != http.MethodPost {
		http.Error(w, "Method not allowed", http.StatusMethodNotAllowed)
		return
	}

	var payload DeleteTransactionPayload
	if err := json.NewDecoder(r.Body).Decode(&payload); err != nil {
		http.Error(w, "Invalid request body", http.StatusBadRequest)
		return
	}

	if payload.ID == 0 {
		http.Error(w, "Transaction ID is required", http.StatusBadRequest)
		return
	}

	res, err := db.db.Exec("DELETE FROM transactions WHERE transaction_id = $1 AND user_id = $2", payload.ID, userId)
	if err != nil {
		log.Printf("Error deleting transaction %d: %v", payload.ID, err)
		http.Error(w, "Failed to delete transaction", http.StatusInternalServerError)
		return
	}

	rowsAffected, err := res.RowsAffected()
	if err != nil {
		log.Printf("Error getting rows affected for transaction %d: %v", payload.ID, err)
		http.Error(w, "Failed to delete transaction", http.StatusInternalServerError)
		return
	}

	if rowsAffected == 0 {
		http.Error(w, "Transaction not found", http.StatusNotFound)
		return
	}

	w.WriteHeader(http.StatusOK)
}
