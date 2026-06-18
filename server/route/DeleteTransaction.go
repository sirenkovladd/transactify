package route

import (
	"encoding/json"
	"log"
	"net/http"
)

type DeleteTransactionPayload struct {
	ID uint64 `json:"id"`
}

func (h WithStore) DeleteTransaction(w http.ResponseWriter, r *http.Request, userId uint64) {
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

	deleted, err := h.s.DeleteTransaction(payload.ID, userId)
	if err != nil {
		log.Printf("Error deleting transaction %d: %v", payload.ID, err)
		http.Error(w, "Failed to delete transaction", http.StatusInternalServerError)
		return
	}

	if !deleted {
		http.Error(w, "Transaction not found", http.StatusNotFound)
		return
	}

	w.WriteHeader(http.StatusOK)
}
