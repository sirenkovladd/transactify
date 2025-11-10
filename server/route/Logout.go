package route

import (
	"log"
	"net/http"
	"strings"
)

func (db WithDB) Logout(w http.ResponseWriter, r *http.Request, userId int) {
	if r.Method != http.MethodPost {
		http.Error(w, "Method not allowed", http.StatusMethodNotAllowed)
		return
	}

	authHeader := r.Header.Get("Authorization")
	tokenString := strings.TrimPrefix(authHeader, "Bearer ")

	_, err := db.db.Exec("DELETE FROM sessions WHERE session_code = $1 AND user_id = $2", tokenString, userId)
	if err != nil {
		log.Printf("Error deleting session for user %d: %v", userId, err)
		http.Error(w, "Failed to log out", http.StatusInternalServerError)
		return
	}

	w.WriteHeader(http.StatusOK)
}
