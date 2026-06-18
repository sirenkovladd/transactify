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

func (h WithStore) ManageCategory(w http.ResponseWriter, r *http.Request, userId uint64) {
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

	for _, transactionID := range payload.TransactionIDs {
		t, err := h.s.GetTransaction(uint64(transactionID))
		if err != nil {
			log.Printf("Failed to look up transaction %d: %v", transactionID, err)
			http.Error(w, "Failed to update category", http.StatusInternalServerError)
			return
		}
		if t.UserID != userId {
			// Skip transactions the user does not own. The SQL version
			// did "AND user_id = $3" which silently affected zero rows;
			// we honor the same semantics.
			continue
		}
		t.Category = payload.Category
		if err := h.s.UpdateTransaction(t); err != nil {
			log.Printf("Failed to update category for transaction %d: %v", transactionID, err)
			http.Error(w, "Failed to update category", http.StatusInternalServerError)
			return
		}
	}

	w.WriteHeader(http.StatusOK)
}
