package route

import (
	"encoding/json"
	"log"
	"net/http"

	"code.sirenko.ca/transaction/src"
)

func (db WithDB) GetCategories(w http.ResponseWriter, r *http.Request, userId int) {
	if r.Method != http.MethodGet {
		http.Error(w, "Method not allowed", http.StatusMethodNotAllowed)
		return
	}

	categoryKeys := make([]string, 0, len(src.Categories))
	for k := range src.Categories {
		categoryKeys = append(categoryKeys, k)
	}

	w.Header().Set("Content-Type", "application/json")
	err := json.NewEncoder(w).Encode(categoryKeys)
	if err != nil {
		log.Printf("Error encoding categories: %v", err)
		http.Error(w, "Failed to encode categories", http.StatusInternalServerError)
	}
}
