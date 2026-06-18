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

func (h WithStore) GetSubscriptions(w http.ResponseWriter, r *http.Request, userId uint64) {
	if r.Method != http.MethodGet {
		http.Error(w, "Method not allowed", http.StatusMethodNotAllowed)
		return
	}

	subscribers, err := h.s.ListSubscribers(userId)
	if err != nil {
		log.Printf("Error querying subscriptions for user %d: %v", userId, err)
		http.Error(w, "Failed to query subscriptions", http.StatusInternalServerError)
		return
	}

	subscriptions := make([]Subscription, 0, len(subscribers))
	for _, sid := range subscribers {
		u, err := h.s.GetUserByID(sid)
		if err != nil {
			log.Printf("Error looking up user %d: %v", sid, err)
			continue
		}
		encryptedUserID, err := src.Encrypt(strconv.FormatUint(sid, 10))
		if err != nil {
			log.Printf("Error encrypting user ID %d: %v", sid, err)
			http.Error(w, "Failed to encrypt user ID", http.StatusInternalServerError)
			return
		}
		subscriptions = append(subscriptions, Subscription{
			PersonName:      u.PersonName,
			EncryptedUserID: encryptedUserID,
		})
	}

	w.Header().Set("Content-Type", "application/json")
	json.NewEncoder(w).Encode(subscriptions)
}
