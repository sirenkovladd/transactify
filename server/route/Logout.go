package route

import (
	"log"
	"net/http"
	"strings"
)

func (h WithStore) Logout(w http.ResponseWriter, r *http.Request, userId uint64) {
	if r.Method != http.MethodPost {
		http.Error(w, "Method not allowed", http.StatusMethodNotAllowed)
		return
	}

	authHeader := r.Header.Get("Authorization")
	tokenString := strings.TrimPrefix(authHeader, "Bearer ")

	if err := h.s.DeleteSession(tokenString, userId); err != nil {
		log.Printf("Error deleting session for user %d: %v", userId, err)
		http.Error(w, "Failed to log out", http.StatusInternalServerError)
		return
	}

	w.WriteHeader(http.StatusOK)
}
