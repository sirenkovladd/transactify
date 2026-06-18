package route

import (
	"encoding/json"
	"log"
	"net/http"
	"time"

	"code.sirenko.ca/transaction/src"
	"code.sirenko.ca/transaction/store"
)

type LoginPayload struct {
	Username string `json:"username"`
	Password string `json:"password"`
}

type User struct {
	ID           uint64
	Username     string
	HashPassword string
}

func (h WithStore) Login(w http.ResponseWriter, r *http.Request) {
	if r.Method != http.MethodPost {
		http.Error(w, "Method not allowed", http.StatusMethodNotAllowed)
		return
	}

	var payload LoginPayload
	if err := json.NewDecoder(r.Body).Decode(&payload); err != nil {
		http.Error(w, "Invalid request body", http.StatusBadRequest)
		return
	}

	user := &User{}
	dbUser, err := h.s.GetUserByUsername(payload.Username)
	if err != nil {
		if err == store.ErrNotFound {
			http.Error(w, "Invalid username or password", http.StatusUnauthorized)
			return
		}
		log.Printf("Error querying database for user %s: %v", payload.Username, err)
		http.Error(w, "Failed to query database", http.StatusInternalServerError)
		return
	}
	user.ID = dbUser.ID
	user.Username = dbUser.Username
	user.HashPassword = dbUser.HashPassword

	match, err := src.ComparePasswordAndHash(payload.Password, user.HashPassword)
	if err != nil {
		log.Printf("Error comparing password for user %s: %v", payload.Username, err)
		http.Error(w, "Invalid username or password", http.StatusUnauthorized)
		return
	}

	if !match {
		http.Error(w, "Invalid username or password", http.StatusUnauthorized)
		return
	}

	token, err := generateSecureToken(32)
	if err != nil {
		log.Printf("Error generating session token for user %s: %v", payload.Username, err)
		http.Error(w, "Failed to generate session token", http.StatusInternalServerError)
		return
	}

	if err := h.s.CreateSession(&store.Session{
		Code:     token,
		UserID:   user.ID,
		Device:   r.UserAgent(),
		LastIP:   r.RemoteAddr,
		LastUsed: time.Now(),
	}); err != nil {
		log.Printf("Error creating session for user %s: %v", payload.Username, err)
		http.Error(w, "Failed to create session", http.StatusInternalServerError)
		return
	}

	w.Header().Set("Content-Type", "application/json")
	json.NewEncoder(w).Encode(map[string]string{"token": token})
}
