package route

import (
	"encoding/json"
	"log"
	"net/http"
)

type RevokeTokenPayload struct {
	Token string `json:"token"`
}

func (h WithStore) RevokeSharingToken(w http.ResponseWriter, r *http.Request, userId uint64) {
	if r.Method != http.MethodPost {
		http.Error(w, "Method not allowed", http.StatusMethodNotAllowed)
		return
	}

	var payload RevokeTokenPayload
	if err := json.NewDecoder(r.Body).Decode(&payload); err != nil {
		http.Error(w, "Invalid request body", http.StatusBadRequest)
		return
	}

	if err := h.s.RevokeToken(payload.Token, userId); err != nil {
		log.Printf("Error revoking sharing token for user %d: %v", userId, err)
		http.Error(w, "Failed to revoke sharing token", http.StatusInternalServerError)
		return
	}

	w.WriteHeader(http.StatusOK)
}
