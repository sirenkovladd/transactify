package route

import (
	"encoding/json"
	"log"
	"net/http"

	"code.sirenko.ca/transaction/store"
)

type AddConnectionPayload struct {
	Token string `json:"token"`
}

func (h WithStore) AddSharingConnection(w http.ResponseWriter, r *http.Request, userId uint64) {
	if r.Method != http.MethodPost {
		http.Error(w, "Method not allowed", http.StatusMethodNotAllowed)
		return
	}

	var payload AddConnectionPayload
	if err := json.NewDecoder(r.Body).Decode(&payload); err != nil {
		http.Error(w, "Invalid request body", http.StatusBadRequest)
		return
	}

	connectedUserId, err := h.s.GetTokenOwner(payload.Token)
	if err != nil {
		if err == store.ErrNotFound {
			http.Error(w, "Invalid sharing token", http.StatusBadRequest)
			return
		}
		log.Printf("Error validating sharing token: %v", err)
		http.Error(w, "Failed to validate sharing token", http.StatusInternalServerError)
		return
	}

	if err := h.s.AddConnection(userId, connectedUserId); err != nil {
		log.Printf("Error creating sharing connection for user %d: %v", userId, err)
		http.Error(w, "Failed to create sharing connection", http.StatusInternalServerError)
		return
	}

	w.WriteHeader(http.StatusCreated)
}
