package route

import (
	"encoding/json"
	"log"
	"net/http"
)

func (db WithDB) GetSharingTokens(w http.ResponseWriter, r *http.Request, userId int) {
	if r.Method != http.MethodGet {
		http.Error(w, "Method not allowed", http.StatusMethodNotAllowed)
		return
	}

	rows, err := db.db.Query("SELECT token FROM sharing_tokens WHERE user_id = $1", userId)
	if err != nil {
		log.Printf("Error querying sharing tokens for user %d: %v", userId, err)
		http.Error(w, "Failed to query sharing tokens", http.StatusInternalServerError)
		return
	}
	defer rows.Close()

	var tokens []string
	for rows.Next() {
		var token string
		if err := rows.Scan(&token); err != nil {
			log.Printf("Error scanning sharing token: %v", err)
			http.Error(w, "Failed to scan sharing token", http.StatusInternalServerError)
			return
		}
		tokens = append(tokens, token)
	}

	w.Header().Set("Content-Type", "application/json")
	json.NewEncoder(w).Encode(tokens)
}
