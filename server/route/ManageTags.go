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

func (h WithStore) ManageTags(w http.ResponseWriter, r *http.Request, userId uint64) {
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

	tag, err := h.s.GetOrCreateTag(payload.Tag)
	if err != nil {
		log.Printf("Failed to get or create tag %s: %v", payload.Tag, err)
		http.Error(w, "Failed to get or create tag", http.StatusInternalServerError)
		return
	}

	if payload.Action == "add" {
		for _, transactionID := range payload.TransactionIDs {
			if err := h.s.AddTagToTransaction(uint64(transactionID), tag.ID); err != nil {
				log.Printf("Failed to add tag to transaction %d: %v", transactionID, err)
				http.Error(w, "Failed to add tag to transaction", http.StatusInternalServerError)
				return
			}
		}
	} else if payload.Action == "remove" {
		for _, transactionID := range payload.TransactionIDs {
			if err := h.s.RemoveTagFromTransaction(uint64(transactionID), tag.ID); err != nil {
				log.Printf("Failed to remove tag from transaction %d: %v", transactionID, err)
				http.Error(w, "Failed to remove tag from transaction", http.StatusInternalServerError)
				return
			}
		}
	}

	w.WriteHeader(http.StatusOK)
}
