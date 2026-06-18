package route

import (
	"crypto/md5"
	"encoding/json"
	"fmt"
	"log"
	"net/http"
	"path/filepath"
	"strconv"
	"time"

	"code.sirenko.ca/transaction/src"
)

type Transaction struct {
	ID         uint64   `json:"id"`
	Amount     float64  `json:"amount"`
	Currency   string   `json:"currency"`
	OccurredAt string   `json:"occurredAt"`
	Merchant   string   `json:"merchant"`
	PersonName string   `json:"personName"`
	Card       string   `json:"card"`
	Category   string   `json:"category"`
	Details    *string  `json:"details"`
	Tags       []string `json:"tags"`
	Photos     []string `json:"photos"`
}

func (h WithStore) GetTransactions(w http.ResponseWriter, r *http.Request, userId uint64) {
	if r.Method != http.MethodGet {
		http.Error(w, "Method not allowed", http.StatusMethodNotAllowed)
		return
	}

	// Build the set of user IDs whose transactions are visible to userId:
	// self + every connected user.
	userIDs := []uint64{userId}
	connected, err := h.s.ListConnectedUserIDs(userId)
	if err != nil {
		log.Printf("Error listing connections: %v", err)
		http.Error(w, "Failed to query database", http.StatusInternalServerError)
		return
	}
	userIDs = append(userIDs, connected...)

	var transactions []Transaction
	for _, uid := range userIDs {
		rows, err := h.s.ListTransactionsForUser(uid)
		if err != nil {
			log.Printf("Error listing transactions for user %d: %v", uid, err)
			http.Error(w, "Failed to query database", http.StatusInternalServerError)
			return
		}
		for _, t := range rows {
			personName := ""
			if u, err := h.s.GetUserByID(uid); err == nil {
				personName = u.PersonName
			}
			tags, _ := h.s.ListTagsForTransaction(t.ID)
			photoPaths, _ := h.s.ListPhotosForTransaction(t.ID)

			// Encrypt IDs for photo URLs.
			encryptedUserId, err := src.Encrypt(strconv.FormatUint(uid, 10))
			if err != nil {
				log.Printf("Error encrypting user ID: %v", err)
				http.Error(w, "Internal server error", http.StatusInternalServerError)
				return
			}
			encryptedTransactionId, err := src.Encrypt(strconv.FormatUint(t.ID, 10))
			if err != nil {
				log.Printf("Error encrypting transaction ID: %v", err)
				http.Error(w, "Internal server error", http.StatusInternalServerError)
				return
			}
			for i, p := range photoPaths {
				photoPaths[i] = "/uploads/transaction/" + encryptedUserId + "/" + encryptedTransactionId + "/" + filepath.Base(p)
			}
			if tags == nil {
				tags = []string{}
			}
			if photoPaths == nil {
				photoPaths = []string{}
			}
			var details *string
			if t.Details != "" {
				d := t.Details
				details = &d
			}
			transactions = append(transactions, Transaction{
				ID:         t.ID,
				Amount:     t.Amount,
				Currency:   t.Currency,
				OccurredAt: t.OccurredAt.Format(time.RFC3339),
				Merchant:   t.Merchant,
				PersonName: personName,
				Card:       t.Card,
				Category:   t.Category,
				Details:    details,
				Tags:       tags,
				Photos:     photoPaths,
			})
		}
	}

	data, err := json.Marshal(transactions)
	if err != nil {
		log.Printf("Error marshaling transactions: %v", err)
		http.Error(w, "Internal server error", http.StatusInternalServerError)
		return
	}

	hash := md5.Sum(data)
	etag := fmt.Sprintf(`"%x"`, hash)
	if match := r.Header.Get("If-None-Match"); match == etag {
		w.WriteHeader(http.StatusNotModified)
		return
	}
	w.Header().Set("Content-Type", "application/json")
	w.Header().Set("ETag", etag)
	w.Write(data)
}
