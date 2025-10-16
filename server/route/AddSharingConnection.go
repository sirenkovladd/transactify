package route

import (
	"database/sql"
	"encoding/json"
	"log"
	"net/http"
)

type AddConnectionPayload struct {
	Token string `json:"token"`
}

func (db WithDB) AddSharingConnection(w http.ResponseWriter, r *http.Request, userId int) {
	if r.Method != http.MethodPost {
		http.Error(w, "Method not allowed", http.StatusMethodNotAllowed)
		return
	}

	var payload AddConnectionPayload
	if err := json.NewDecoder(r.Body).Decode(&payload); err != nil {
		http.Error(w, "Invalid request body", http.StatusBadRequest)
		return
	}

	var connectedUserId int
	err := db.db.QueryRow("SELECT user_id FROM sharing_tokens WHERE token = $1", payload.Token).Scan(&connectedUserId)
	if err != nil {
		if err == sql.ErrNoRows {
			http.Error(w, "Invalid sharing token", http.StatusBadRequest)
			return
		}
		log.Printf("Error validating sharing token: %v", err)
		http.Error(w, "Failed to validate sharing token", http.StatusInternalServerError)
		return
	}

	_, err = db.db.Exec("INSERT INTO user_connections (user_id, connected_user_id) VALUES ($1, $2) ON CONFLICT DO NOTHING", userId, connectedUserId)
	if err != nil {
		log.Printf("Error creating sharing connection for user %d: %v", userId, err)
		http.Error(w, "Failed to create sharing connection", http.StatusInternalServerError)
		return
	}

	w.WriteHeader(http.StatusCreated)
}
