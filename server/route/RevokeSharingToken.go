package route

import (
	"encoding/json"
	"log"
	"net/http"
)

type RevokeTokenPayload struct {
	Token string `json:"token"`
}

func (db WithDB) RevokeSharingToken(w http.ResponseWriter, r *http.Request, userId int) {
	if r.Method != http.MethodPost {
		http.Error(w, "Method not allowed", http.StatusMethodNotAllowed)
		return
	}

	var payload RevokeTokenPayload
	if err := json.NewDecoder(r.Body).Decode(&payload); err != nil {
		http.Error(w, "Invalid request body", http.StatusBadRequest)
		return
	}

	_, err := db.db.Exec("DELETE FROM sharing_tokens WHERE token = $1 AND user_id = $2", payload.Token, userId)
	if err != nil {
		log.Printf("Error revoking sharing token for user %d: %v", userId, err)
		http.Error(w, "Failed to revoke sharing token", http.StatusInternalServerError)
		return
	}

	w.WriteHeader(http.StatusOK)
}
