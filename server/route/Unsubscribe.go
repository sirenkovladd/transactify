package route

import (
	"encoding/json"
	"log"
	"net/http"
	"strconv"

	"code.sirenko.ca/transaction/src"
)

type UnsubscribePayload struct {
	EncryptedUserID string `json:"encryptedUserId"`
}

func (h WithStore) Unsubscribe(w http.ResponseWriter, r *http.Request, userId uint64) {
	if r.Method != http.MethodPost {
		http.Error(w, "Method not allowed", http.StatusMethodNotAllowed)
		return
	}

	var payload UnsubscribePayload
	if err := json.NewDecoder(r.Body).Decode(&payload); err != nil {
		http.Error(w, "Invalid request body", http.StatusBadRequest)
		return
	}

	if payload.EncryptedUserID == "" {
		http.Error(w, "Encrypted user ID is required", http.StatusBadRequest)
		return
	}

	decryptedUserIDStr, err := src.Decrypt(payload.EncryptedUserID)
	if err != nil {
		log.Printf("Error decrypting user ID: %v", err)
		http.Error(w, "Failed to decrypt user ID", http.StatusInternalServerError)
		return
	}

	connectedUserId, err := strconv.ParseUint(decryptedUserIDStr, 10, 64)
	if err != nil {
		log.Printf("Error converting decrypted user ID to int: %v", err)
		http.Error(w, "Invalid decrypted user ID format", http.StatusInternalServerError)
		return
	}

	removed, err := h.s.RemoveConnection(userId, connectedUserId)
	if err != nil {
		log.Printf("Error unsubscribing user %d from %d: %v", userId, connectedUserId, err)
		http.Error(w, "Failed to unsubscribe", http.StatusInternalServerError)
		return
	}

	if !removed {
		http.Error(w, "Subscription not found or already unsubscribed", http.StatusNotFound)
		return
	}

	w.WriteHeader(http.StatusOK)
}
