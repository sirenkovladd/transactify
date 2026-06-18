package route

import (
	"encoding/json"
	"log"
	"net/http"
)

func (h WithStore) GetSharingTokens(w http.ResponseWriter, r *http.Request, userId uint64) {
	if r.Method != http.MethodGet {
		http.Error(w, "Method not allowed", http.StatusMethodNotAllowed)
		return
	}

	tokens, err := h.s.ListTokensForUser(userId)
	if err != nil {
		log.Printf("Error querying sharing tokens for user %d: %v", userId, err)
		http.Error(w, "Failed to query sharing tokens", http.StatusInternalServerError)
		return
	}

	if tokens == nil {
		tokens = []string{}
	}

	w.Header().Set("Content-Type", "application/json")
	json.NewEncoder(w).Encode(tokens)
}
