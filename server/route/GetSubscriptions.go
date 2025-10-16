package route

import (
	"encoding/json"
	"log"
	"net/http"
	"strconv"

	"code.sirenko.ca/transaction/src"
)

type Subscription struct {
	PersonName      string `json:"personName"`
	EncryptedUserID string `json:"encryptedUserId"`
}

func (db WithDB) GetSubscriptions(w http.ResponseWriter, r *http.Request, userId int) {
	if r.Method != http.MethodGet {
		http.Error(w, "Method not allowed", http.StatusMethodNotAllowed)
		return
	}

	rows, err := db.db.Query("SELECT u.person_name, u.user_id FROM user_connections uc JOIN users u ON uc.user_id = u.user_id WHERE uc.connected_user_id = $1", userId)
	if err != nil {
		log.Printf("Error querying subscriptions for user %d: %v", userId, err)
		http.Error(w, "Failed to query subscriptions", http.StatusInternalServerError)
		return
	}
	defer rows.Close()

	var subscriptions []Subscription
	for rows.Next() {
		var s Subscription
		var rawUserID int
		if err := rows.Scan(&s.PersonName, &rawUserID); err != nil {
			log.Printf("Error scanning subscription: %v", err)
			http.Error(w, "Failed to scan subscription", http.StatusInternalServerError)
			return
		}

		encryptedUserID, err := src.Encrypt(strconv.Itoa(rawUserID))
		if err != nil {
			log.Printf("Error encrypting user ID %d: %v", rawUserID, err)
			http.Error(w, "Failed to encrypt user ID", http.StatusInternalServerError)
			return
		}
		s.EncryptedUserID = encryptedUserID

		subscriptions = append(subscriptions, s)
	}

	w.Header().Set("Content-Type", "application/json")
	json.NewEncoder(w).Encode(subscriptions)
}
