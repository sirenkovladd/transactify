package route

import (
	"encoding/json"
	"log"
	"net/http"
)

func (db WithDB) GenerateSharingToken(w http.ResponseWriter, r *http.Request, userId int) {
	if r.Method != http.MethodPost {
		http.Error(w, "Method not allowed", http.StatusMethodNotAllowed)
		return
	}

	token, err := generateSecureToken(32)
	if err != nil {
		log.Printf("Error generating sharing token for user %d: %v", userId, err)
		http.Error(w, "Failed to generate sharing token", http.StatusInternalServerError)
		return
	}

	_, err = db.db.Exec("INSERT INTO sharing_tokens (user_id, token) VALUES ($1, $2)", userId, token)
	if err != nil {
		log.Printf("Error creating sharing token for user %d: %v", userId, err)
		http.Error(w, "Failed to create sharing token", http.StatusInternalServerError)
		return
	}

	w.Header().Set("Content-Type", "application/json")
	json.NewEncoder(w).Encode(map[string]string{"token": token})
}
