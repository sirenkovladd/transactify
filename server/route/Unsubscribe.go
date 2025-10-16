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

func (db WithDB) Unsubscribe(w http.ResponseWriter, r *http.Request, userId int) {
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

	connectedUserId, err := strconv.Atoi(decryptedUserIDStr)
	if err != nil {
		log.Printf("Error converting decrypted user ID to int: %v", err)
		http.Error(w, "Invalid decrypted user ID format", http.StatusInternalServerError)
		return
	}

	res, err := db.db.Exec("DELETE FROM user_connections WHERE user_id = $1 AND connected_user_id = $2", userId, connectedUserId)
	if err != nil {
		log.Printf("Error unsubscribing user %d from %d: %v", userId, connectedUserId, err)
		http.Error(w, "Failed to unsubscribe", http.StatusInternalServerError)
		return
	}

	rowsAffected, err := res.RowsAffected()
	if err != nil {
		log.Printf("Error getting rows affected for unsubscribe: %v", err)
		http.Error(w, "Failed to unsubscribe", http.StatusInternalServerError)
		return
	}

	if rowsAffected == 0 {
		http.Error(w, "Subscription not found or already unsubscribed", http.StatusNotFound)
		return
	}

	w.WriteHeader(http.StatusOK)
}