package route

import (
	"encoding/json"
	"log"
	"net/http"

	"code.sirenko.ca/transaction/store"
)

type UpdateTransactionPayload struct {
	ID         uint64   `json:"id"`
	Amount     *float64 `json:"amount"`
	Currency   *string  `json:"currency"`
	OccurredAt *string  `json:"occurredAt"`
	Merchant   *string  `json:"merchant"`
	Card       *string  `json:"card"`
	Category   *string  `json:"category"`
	Details    *string  `json:"details"`
	Tags       []string `json:"tags"`
}

func (h WithStore) UpdateTransaction(w http.ResponseWriter, r *http.Request, userId uint64) {
	if r.Method != http.MethodPost {
		http.Error(w, "Method not allowed", http.StatusMethodNotAllowed)
		return
	}

	var payload UpdateTransactionPayload
	if err := json.NewDecoder(r.Body).Decode(&payload); err != nil {
		http.Error(w, "Invalid request body", http.StatusBadRequest)
		return
	}

	if payload.ID == 0 {
		http.Error(w, "Transaction ID is required", http.StatusBadRequest)
		return
	}

	// Ownership + access check.
	transaction, err := h.s.GetTransaction(payload.ID)
	if err != nil {
		if err == store.ErrNotFound {
			http.Error(w, "Transaction not found", http.StatusNotFound)
			return
		}
		log.Printf("Error querying transaction: %v", err)
		http.Error(w, "Failed to check transaction permissions", http.StatusInternalServerError)
		return
	}

	hasAccess := userId == transaction.UserID
	if !hasAccess {
		connected, err := h.s.ListConnectedUserIDs(transaction.UserID)
		if err != nil {
			log.Printf("Error checking user connection: %v", err)
			http.Error(w, "Failed to check transaction permissions", http.StatusInternalServerError)
			return
		}
		for _, cid := range connected {
			if cid == userId {
				hasAccess = true
				break
			}
		}
	}

	if !hasAccess {
		http.Error(w, "You do not have permission to update this transaction", http.StatusForbidden)
		return
	}

	// Reconcile tag set if the caller provided one.
	if payload.Tags != nil {
		if err := h.s.ReplaceTagsForTransaction(payload.ID, payload.Tags); err != nil {
			log.Printf("Error replacing tags for transaction %d: %v", payload.ID, err)
			http.Error(w, "Failed to update tags", http.StatusInternalServerError)
			return
		}
	}

	// Apply field updates.
	changed := false
	if payload.Merchant != nil {
		transaction.Merchant = *payload.Merchant
		changed = true
	}
	if payload.Amount != nil {
		transaction.Amount = *payload.Amount
		changed = true
	}
	if payload.OccurredAt != nil {
		occurredAt, err := parseOccurredAt(*payload.OccurredAt)
		if err != nil {
			http.Error(w, "Invalid occurredAt: "+err.Error(), http.StatusBadRequest)
			return
		}
		transaction.OccurredAt = occurredAt
		changed = true
	}
	if payload.Card != nil {
		transaction.Card = *payload.Card
		changed = true
	}
	if payload.Category != nil {
		transaction.Category = *payload.Category
		changed = true
	}
	if payload.Details != nil {
		transaction.Details = *payload.Details
		changed = true
	}
	if payload.Currency != nil {
		transaction.Currency = *payload.Currency
		changed = true
	}

	if changed {
		if err := h.s.UpdateTransaction(transaction); err != nil {
			log.Printf("Error updating transaction %d: %v", payload.ID, err)
			http.Error(w, "Failed to update transaction", http.StatusInternalServerError)
			return
		}
	}

	w.WriteHeader(http.StatusOK)
}
