package route

import (
	"encoding/json"
	"log"
	"net/http"
)

func (db WithDB) GetSharingConnections(w http.ResponseWriter, r *http.Request, userId int) {
	if r.Method != http.MethodGet {
		http.Error(w, "Method not allowed", http.StatusMethodNotAllowed)
		return
	}

	rows, err := db.db.Query("SELECT u.person_name FROM user_connections uc JOIN users u ON uc.connected_user_id = u.user_id WHERE uc.user_id = $1", userId)
	if err != nil {
		log.Printf("Error querying sharing connections for user %d: %v", userId, err)
		http.Error(w, "Failed to query sharing connections", http.StatusInternalServerError)
		return
	}
	defer rows.Close()

	var connections []string
	for rows.Next() {
		var personName string
		if err := rows.Scan(&personName); err != nil {
			log.Printf("Error scanning sharing connection: %v", err)
			http.Error(w, "Failed to scan sharing connection", http.StatusInternalServerError)
			return
		}
		connections = append(connections, personName)
	}

	w.Header().Set("Content-Type", "application/json")
	json.NewEncoder(w).Encode(connections)
}
