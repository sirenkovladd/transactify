package main

import (
	"crypto/rand"
	"database/sql"
	"encoding/hex"
	"encoding/json"
	"fmt"
	"log"
	"net/http"
	"strings"
	"time"

	"code.sirenko.ca/transaction/src"

	_ "github.com/lib/pq"
)

func LoggerMiddleware(next http.Handler) http.Handler {
	return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		log.Printf("%s %s", r.Method, r.URL.Path)
		next.ServeHTTP(w, r)
	})
}

type WithDB struct {
	db *sql.DB
}

type Transaction struct {
	ID         int64    `json:"id"`
	Amount     float64  `json:"amount"`
	Currency   string   `json:"currency"`
	OccurredAt string   `json:"occurredAt"`
	Merchant   string   `json:"merchant"`
	PersonName string   `json:"personName"`
	Card       string   `json:"card"`
	Category   string   `json:"category"`
	Details    *string  `json:"details"`
	Tags       []string `json:"tags"`
}

func (db WithDB) GetTransactions(w http.ResponseWriter, r *http.Request) {
	if r.Method != http.MethodGet {
		http.Error(w, "Method not allowed", http.StatusMethodNotAllowed)
		return
	}

	rows, err := db.db.Query(`
		SELECT
			t.transaction_id, t.amount, t.currency, t.occurred_at, t.merchant, t.person_name, t.card, t.category, t.details,
			COALESCE(STRING_AGG(tags.tag_name, ',' ORDER BY tags.tag_name), '') AS tags
		FROM transactions t
		LEFT JOIN transaction_tags ON t.transaction_id = transaction_tags.transaction_id
		LEFT JOIN tags ON transaction_tags.tag_id = tags.tag_id
		GROUP BY t.transaction_id
		ORDER BY t.occurred_at DESC
	`)
	if err != nil {
		http.Error(w, err.Error(), http.StatusInternalServerError)
		return
	}
	defer rows.Close()

	var transactions []Transaction
	for rows.Next() {
		var t Transaction
		var tags string
		err := rows.Scan(&t.ID, &t.Amount, &t.Currency, &t.OccurredAt, &t.Merchant, &t.PersonName, &t.Card, &t.Category, &t.Details, &tags)
		if tags != "" {
			t.Tags = strings.Split(tags, ",")
		} else {
			t.Tags = []string{}
		}
		if err != nil {
			http.Error(w, err.Error(), http.StatusInternalServerError)
			return
		}
		transactions = append(transactions, t)
	}
	http.Header.Add(w.Header(), "Content-Type", "application/json")
	err = json.NewEncoder(w).Encode(transactions)
	if err != nil {
		log.Fatal(err)
	}
}

type UpdateTransactionPayload struct {
	ID         int64    `json:"id"`
	Amount     *float64 `json:"amount"`
	Currency   *string  `json:"currency"`
	OccurredAt *string  `json:"occurredAt"`
	Merchant   *string  `json:"merchant"`
	PersonName *string  `json:"personName"`
	Card       *string  `json:"card"`
	Category   *string  `json:"category"`
	Details    *string  `json:"details"`
	Tags       []string `json:"tags"`
}

func (db WithDB) UpdateTransaction(w http.ResponseWriter, r *http.Request) {
	if r.Method != http.MethodPost {
		http.Error(w, "Method not allowed", http.StatusMethodNotAllowed)
		return
	}

	var payload UpdateTransactionPayload
	if err := json.NewDecoder(r.Body).Decode(&payload); err != nil {
		http.Error(w, "Invalid request body", http.StatusBadRequest)
		return
	}

	if payload.ID == 0 {
		http.Error(w, "Transaction ID is required", http.StatusBadRequest)
		return
	}

	var query strings.Builder
	query.WriteString("UPDATE transactions SET ")

	params := make([]interface{}, 0)
	paramId := 1

	if payload.Merchant != nil {
		query.WriteString(fmt.Sprintf("merchant = $%d, ", paramId))
		params = append(params, *payload.Merchant)
		paramId++
	}
	if payload.Amount != nil {
		query.WriteString(fmt.Sprintf("amount = $%d, ", paramId))
		params = append(params, *payload.Amount)
		paramId++
	}
	if payload.OccurredAt != nil {
		query.WriteString(fmt.Sprintf("occurred_at = $%d, ", paramId))
		params = append(params, *payload.OccurredAt)
		paramId++
	}
	if payload.PersonName != nil {
		query.WriteString(fmt.Sprintf("person_name = $%d, ", paramId))
		params = append(params, *payload.PersonName)
		paramId++
	}
	if payload.Card != nil {
		query.WriteString(fmt.Sprintf("card = $%d, ", paramId))
		params = append(params, *payload.Card)
		paramId++
	}
	if payload.Category != nil {
		query.WriteString(fmt.Sprintf("category = $%d, ", paramId))
		params = append(params, *payload.Category)
		paramId++
	}
	if payload.Details != nil {
		query.WriteString(fmt.Sprintf("details = $%d, ", paramId))
		params = append(params, *payload.Details)
		paramId++
	}
	if payload.Currency != nil {
		query.WriteString(fmt.Sprintf("currency = $%d, ", paramId))
		params = append(params, *payload.Currency)
		paramId++
	}

	if len(params) > 0 {
		finalQuery := query.String()
		finalQuery = finalQuery[:len(finalQuery)-2]
		finalQuery += fmt.Sprintf(" WHERE transaction_id = $%d", paramId)
		params = append(params, payload.ID)

		_, err := db.db.Exec(finalQuery, params...)
		if err != nil {
			http.Error(w, fmt.Sprintf("Failed to update transaction: %v", err), http.StatusInternalServerError)
			return
		}
	}

	w.WriteHeader(http.StatusOK)
}

type TagPayload struct {
	TransactionIDs []int64 `json:"transaction_ids"`
	Tag            string  `json:"tag"`
	Action         string  `json:"action"` // "add" or "remove"
}

func (db WithDB) ManageTags(w http.ResponseWriter, r *http.Request) {
	if r.Method != http.MethodPost {
		http.Error(w, "Method not allowed", http.StatusMethodNotAllowed)
		return
	}

	var payload TagPayload
	if err := json.NewDecoder(r.Body).Decode(&payload); err != nil {
		http.Error(w, "Invalid request body", http.StatusBadRequest)
		return
	}

	if len(payload.TransactionIDs) == 0 || payload.Tag == "" || (payload.Action != "add" && payload.Action != "remove") {
		http.Error(w, "Invalid payload", http.StatusBadRequest)
		return
	}

	tx, err := db.db.Begin()
	if err != nil {
		http.Error(w, "Failed to start transaction", http.StatusInternalServerError)
		return
	}
	defer tx.Rollback()

	var tagID int64
	// Get or create tag ID
	err = tx.QueryRow("INSERT INTO tags (tag_name) VALUES ($1) ON CONFLICT (tag_name) DO UPDATE SET tag_name = EXCLUDED.tag_name RETURNING tag_id", payload.Tag).Scan(&tagID)
	if err != nil {
		http.Error(w, fmt.Sprintf("Failed to get or create tag: %v", err), http.StatusInternalServerError)
		return
	}

	if payload.Action == "add" {
		stmt, err := tx.Prepare("INSERT INTO transaction_tags (transaction_id, tag_id) VALUES ($1, $2) ON CONFLICT DO NOTHING")
		if err != nil {
			http.Error(w, "Failed to prepare statement", http.StatusInternalServerError)
			return
		}
		defer stmt.Close()

		for _, transactionID := range payload.TransactionIDs {
			_, err := stmt.Exec(transactionID, tagID)
			if err != nil {
				http.Error(w, fmt.Sprintf("Failed to add tag to transaction %d: %v", transactionID, err), http.StatusInternalServerError)
				return
			}
		}
	} else if payload.Action == "remove" {
		stmt, err := tx.Prepare("DELETE FROM transaction_tags WHERE transaction_id = $1 AND tag_id = $2")
		if err != nil {
			http.Error(w, "Failed to prepare statement", http.StatusInternalServerError)
			return
		}
		defer stmt.Close()

		for _, transactionID := range payload.TransactionIDs {
			_, err := stmt.Exec(transactionID, tagID)
			if err != nil {
				http.Error(w, fmt.Sprintf("Failed to remove tag from transaction %d: %v", transactionID, err), http.StatusInternalServerError)
				return
			}
		}
	}

	if err := tx.Commit(); err != nil {
		http.Error(w, "Failed to commit transaction", http.StatusInternalServerError)
		return
	}

	w.WriteHeader(http.StatusOK)
}

func (db WithDB) GetCategories(w http.ResponseWriter, r *http.Request) {
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

func generateSecureToken(length int) (string, error) {
	bytes := make([]byte, length)
	if _, err := rand.Read(bytes); err != nil {
		return "", err
	}
	return hex.EncodeToString(bytes), nil
}

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
		http.Error(w, err.Error(), http.StatusInternalServerError)
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

func (db WithDB) AuthMiddleware(next http.Handler) http.Handler {
	return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		authHeader := r.Header.Get("Authorization")
		if authHeader == "" {
			http.Error(w, "Authorization header required", http.StatusUnauthorized)
			return
		}

		tokenString := strings.TrimPrefix(authHeader, "Bearer ")
		if tokenString == authHeader {
			http.Error(w, "Bearer token required", http.StatusUnauthorized)
			return
		}

		var userID int
		var lastUsed time.Time
		err := db.db.QueryRow("SELECT user_id, last_used FROM sessions WHERE session_code = $1", tokenString).Scan(&userID, &lastUsed)
		if err != nil {
			if err == sql.ErrNoRows {
				http.Error(w, "Invalid session token", http.StatusUnauthorized)
				return
			}
			http.Error(w, err.Error(), http.StatusInternalServerError)
			return
		}
		next.ServeHTTP(w, r)
	})
}

func main() {
	connStr := "postgres://user:password@localhost:5432/mydb?sslmode=disable"
	db, err := sql.Open("postgres", connStr)
	if err != nil {
		log.Fatal(err)
	}
	defer db.Close()

	router := WithDB{db: db}

	mux := http.NewServeMux()
	mux.HandleFunc("/", func(w http.ResponseWriter, r *http.Request) {
		if r.URL.Path != "/" {
			http.NotFound(w, r)
			return
		}
		http.ServeFile(w, r, "./client/index.html")
	})
	mux.HandleFunc("/styles.css", func(w http.ResponseWriter, r *http.Request) {
		http.ServeFile(w, r, "./client/styles.css")
	})
	mux.HandleFunc("/main.js", func(w http.ResponseWriter, r *http.Request) {
		http.ServeFile(w, r, "./client/main.js")
	})
	mux.HandleFunc("/api/login", router.Login)
	mux.Handle("/api/transactions", router.AuthMiddleware(http.HandlerFunc(router.GetTransactions)))
	mux.Handle("/api/transaction/update", router.AuthMiddleware(http.HandlerFunc(router.UpdateTransaction)))
	mux.Handle("/api/transactions/tags", router.AuthMiddleware(http.HandlerFunc(router.ManageTags)))
	mux.Handle("/api/categories", router.AuthMiddleware(http.HandlerFunc(router.GetCategories)))

	log.Print("listening on :8080...")
	err = http.ListenAndServe(":8080", LoggerMiddleware(mux))
	if err != nil {
		panic(err)
	}
}
