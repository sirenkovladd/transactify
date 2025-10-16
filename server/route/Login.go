package route

import (
	"database/sql"
	"encoding/json"
	"log"
	"net/http"

	"code.sirenko.ca/transaction/src"
)

type LoginPayload struct {
	Username string `json:"username"`
	Password string `json:"password"`
}

type User struct {
	ID           int
	Username     string
	HashPassword string
}

func (db WithDB) Login(w http.ResponseWriter, r *http.Request) {
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
	err := db.db.QueryRow("SELECT user_id, username, hash_password FROM users WHERE username = $1", payload.Username).Scan(&user.ID, &user.Username, &user.HashPassword)
	if err != nil {
		if err == sql.ErrNoRows {
			http.Error(w, "Invalid username or password", http.StatusUnauthorized)
			return
		}
		log.Printf("Error querying database for user %s: %v", payload.Username, err)
		http.Error(w, "Failed to query database", http.StatusInternalServerError)
		return
	}

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

	_, err = db.db.Exec("INSERT INTO sessions (user_id, session_code, device, last_ip) VALUES ($1, $2, $3, $4)", user.ID, token, r.UserAgent(), r.RemoteAddr)
	if err != nil {
		log.Printf("Error creating session for user %s: %v", payload.Username, err)
		http.Error(w, "Failed to create session", http.StatusInternalServerError)
		return
	}

	w.Header().Set("Content-Type", "application/json")
	json.NewEncoder(w).Encode(map[string]string{"token": token})
}
