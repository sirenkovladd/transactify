package route

import (
	"encoding/json"
	"log"
	"net/http"
	"strconv"
	"time"

	"code.sirenko.ca/transaction/store"
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

func (h WithStore) AddTransactions(w http.ResponseWriter, r *http.Request, userId uint64) {
	if r.Method != http.MethodPost {
		http.Error(w, "Method not allowed", http.StatusMethodNotAllowed)
		return
	}

	var payload []AddTransactionPayload
	if err := json.NewDecoder(r.Body).Decode(&payload); err != nil {
		http.Error(w, "Invalid request body", http.StatusBadRequest)
		return
	}

	// Dedupe the payload by (merchant, occurred_at, amount) — the SQL
	// unique constraint moved to client-side. First occurrence wins.
	seen := make(map[string]struct{}, len(payload))
	deduped := make([]AddTransactionPayload, 0, len(payload))
	for _, t := range payload {
		occurredAt, err := time.Parse(time.RFC3339, t.OccurredAt)
		if err != nil {
			http.Error(w, "Invalid occurredAt: "+err.Error(), http.StatusBadRequest)
			return
		}
		key := t.Merchant + "|" + occurredAt.UTC().Format(time.RFC3339Nano) + "|" + strconv.FormatFloat(t.Amount, 'f', -1, 64)
		if _, ok := seen[key]; ok {
			continue
		}
		seen[key] = struct{}{}
		t.OccurredAt = occurredAt.Format(time.RFC3339)
		deduped = append(deduped, t)
	}

	for _, t := range deduped {
		occurredAt, _ := time.Parse(time.RFC3339, t.OccurredAt)
		txn := &store.Transaction{
			UserID:     userId,
			Amount:     t.Amount,
			Currency:   t.Currency,
			OccurredAt: occurredAt,
			Merchant:   t.Merchant,
			Card:       t.Card,
			Category:   t.Category,
		}
		if t.Details != nil {
			txn.Details = *t.Details
		}
		if err := h.s.CreateTransaction(txn); err != nil {
			log.Printf("Failed to insert transaction: %v", err)
			http.Error(w, "Failed to insert transaction", http.StatusInternalServerError)
			return
		}

		if len(t.Tags) > 0 {
			for _, tagName := range t.Tags {
				if tagName == "" {
					continue
				}
				tag, err := h.s.GetOrCreateTag(tagName)
				if err != nil {
					log.Printf("Failed to get or create tag %s: %v", tagName, err)
					http.Error(w, "Failed to get or create tag", http.StatusInternalServerError)
					return
				}
				if err := h.s.AddTagToTransaction(txn.ID, tag.ID); err != nil {
					log.Printf("Failed to add tag to transaction %d: %v", txn.ID, err)
					http.Error(w, "Failed to add tag to transaction", http.StatusInternalServerError)
					return
				}
			}
		}
	}

	w.WriteHeader(http.StatusCreated)
}
