package route

import (
	"fmt"
	"log"
	"net/http"
	"strings"

	"code.sirenko.ca/transaction/store"
)

type HTTPError struct {
	Code int
	Err  error
}

func GetUserId(s *store.Store, r *http.Request) (uint64, *HTTPError) {
	authHeader := r.Header.Get("Authorization")
	if authHeader == "" {
		return 0, &HTTPError{http.StatusUnauthorized, fmt.Errorf("authorization header required")}
	}

	tokenString := strings.TrimPrefix(authHeader, "Bearer ")
	if tokenString == authHeader {
		return 0, &HTTPError{http.StatusUnauthorized, fmt.Errorf("bearer token required")}
	}

	sess, err := s.GetSessionByCode(tokenString)
	if err != nil {
		if err == store.ErrNotFound {
			return 0, &HTTPError{http.StatusUnauthorized, fmt.Errorf("invalid session token")}
		}
		log.Printf("Error querying session token %s: %v", tokenString, err)
		return 0, &HTTPError{http.StatusInternalServerError, fmt.Errorf("failed to query database")}
	}
	return sess.UserID, nil
}

func (h WithStore) AuthMiddleware(next func(w http.ResponseWriter, r *http.Request, userId uint64)) http.Handler {
	return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		userId, err := GetUserId(h.s, r)
		if err != nil {
			http.Error(w, err.Err.Error(), err.Code)
			return
		}
		// TODO add userId - transaction validation
		next(w, r, userId)
	})
}
