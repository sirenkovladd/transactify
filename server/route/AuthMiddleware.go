package route

import (
	"database/sql"
	"fmt"
	"log"
	"net/http"
	"strings"
	"time"
)

type HTTPError struct {
	Code int
	Err  error
}

func GetUserId(db *sql.DB, r *http.Request) (int, *HTTPError) {
	authHeader := r.Header.Get("Authorization")
	if authHeader == "" {
		return 0, &HTTPError{http.StatusUnauthorized, fmt.Errorf("authorization header required")}
	}

	tokenString := strings.TrimPrefix(authHeader, "Bearer ")
	if tokenString == authHeader {
		return 0, &HTTPError{http.StatusUnauthorized, fmt.Errorf("bearer token required")}
	}

	var userID int
	var lastUsed time.Time
	err := db.QueryRow("SELECT user_id, last_used FROM sessions WHERE session_code = $1", tokenString).Scan(&userID, &lastUsed)
	if err != nil {
		if err == sql.ErrNoRows {
			return 0, &HTTPError{http.StatusUnauthorized, fmt.Errorf("invalid session token")}
		}
		log.Printf("Error querying database for session token %s: %v", tokenString, err)
		return 0, &HTTPError{http.StatusInternalServerError, fmt.Errorf("failed to query database")}
	}
	return userID, nil
}

func (db WithDB) AuthMiddleware(next func(w http.ResponseWriter, r *http.Request, userId int)) http.Handler {
	return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		userId, err := GetUserId(db.db, r)
		if err != nil {
			http.Error(w, err.Err.Error(), err.Code)
			return
		}
		// TODO add userId - transaction validation
		next(w, r, userId)
	})
}
