package route

import (
	"crypto/rand"
	"database/sql"
	"encoding/hex"
	"encoding/json"
	"fmt"
	"io"
	"log"
	"net/http"
	"os"
	"path/filepath"
	"strconv"
	"strings"

	"code.sirenko.ca/transaction/src"
)

var allowedExtensions = map[string]bool{
	".jpg":  true,
	".jpeg": true,
	".png":  true,
}

type DeletePhotoPayload struct {
	FilePath string `json:"filePath"`
}

func (db WithDB) AttachPhoto(w http.ResponseWriter, r *http.Request, userId int) {
	transactionIdStr := r.PathValue("id")
	if transactionIdStr == "" {
		http.Error(w, "Transaction ID is required", http.StatusBadRequest)
		return
	}
	transactionId, err := strconv.ParseInt(transactionIdStr, 10, 64)
	if err != nil {
		http.Error(w, "Invalid Transaction ID", http.StatusBadRequest)
		return
	}

	var ownerId int
	err = db.db.QueryRow("SELECT user_id FROM transactions WHERE transaction_id = $1", transactionId).Scan(&ownerId)
	if err != nil {
		if err == sql.ErrNoRows {
			http.Error(w, "Transaction not found", http.StatusNotFound)
			return
		}
		log.Printf("Error checking transaction ownership: %v", err)
		http.Error(w, "Internal server error", http.StatusInternalServerError)
		return
	}
	if ownerId != userId {
		http.Error(w, "Forbidden", http.StatusForbidden)
		return
	}

	if err := r.ParseMultipartForm(10 << 20); err != nil { // 10 MB
		http.Error(w, "Unable to parse form", http.StatusBadRequest)
		return
	}

	file, handler, err := r.FormFile("photo")
	if err != nil {
		http.Error(w, "Error retrieving the file", http.StatusBadRequest)
		return
	}
	defer file.Close()

	ext := strings.ToLower(filepath.Ext(handler.Filename))
	if !allowedExtensions[ext] {
		http.Error(w, fmt.Sprintf("File extension %s is not allowed", ext), http.StatusBadRequest)
		return
	}

	encryptedUserId, err := src.Encrypt(strconv.Itoa(userId))
	if err != nil {
		log.Printf("Error encrypting user ID: %v", err)
		http.Error(w, "Internal server error", http.StatusInternalServerError)
		return
	}

	encryptedTransactionId, err := src.Encrypt(transactionIdStr)
	if err != nil {
		log.Printf("Error encrypting transaction ID: %v", err)
		http.Error(w, "Internal server error", http.StatusInternalServerError)
		return
	}

	randomBytes := make([]byte, 16)
	if _, err := rand.Read(randomBytes); err != nil {
		log.Printf("Error generating random bytes: %v", err)
		http.Error(w, "Internal server error", http.StatusInternalServerError)
		return
	}
	randomString := hex.EncodeToString(randomBytes)

	dirPath := filepath.Join("uploads", encryptedUserId, encryptedTransactionId)
	if err := os.MkdirAll(dirPath, 0755); err != nil {
		http.Error(w, "Unable to create directory", http.StatusInternalServerError)
		return
	}

	fileName := fmt.Sprintf("photo-%s%s", randomString, ext)
	filePath := filepath.Join(dirPath, fileName)

	_, err = db.db.Exec("INSERT INTO transaction_photos (transaction_id, file_path) VALUES ($1, $2)", transactionId, filePath)
	if err != nil {
		log.Printf("Failed to create photo record: %v", err)
		http.Error(w, "Failed to create photo record", http.StatusInternalServerError)
		return
	}

	dst, err := os.Create(filePath)
	if err != nil {
		http.Error(w, "Unable to create the file for writing", http.StatusInternalServerError)
		return
	}
	defer dst.Close()

	if _, err := io.Copy(dst, file); err != nil {
		http.Error(w, "Unable to save the file", http.StatusInternalServerError)
		return
	}

	w.Header().Set("Content-Type", "application/json")
	json.NewEncoder(w).Encode(map[string]interface{}{
		"photoUrl": fmt.Sprintf("/uploads/transaction/%s/%s/%s", encryptedUserId, encryptedTransactionId, fileName),
	})
}

func (db WithDB) DeletePhotoByPath(w http.ResponseWriter, r *http.Request, userId int) {
	var payload DeletePhotoPayload
	if err := json.NewDecoder(r.Body).Decode(&payload); err != nil {
		http.Error(w, "Invalid request body", http.StatusBadRequest)
		return
	}

	var transactionId int64
	err := db.db.QueryRow("SELECT transaction_id FROM transaction_photos WHERE file_path = $1", payload.FilePath).Scan(&transactionId)
	if err != nil {
		if err == sql.ErrNoRows {
			http.Error(w, "Photo not found", http.StatusNotFound)
			return
		}
		log.Printf("Error finding photo: %v", err)
		http.Error(w, "Internal server error", http.StatusInternalServerError)
		return
	}

	var ownerId int
	err = db.db.QueryRow("SELECT user_id FROM transactions WHERE transaction_id = $1", transactionId).Scan(&ownerId)
	if err != nil {
		log.Printf("Error checking transaction ownership: %v", err)
		http.Error(w, "Internal server error", http.StatusInternalServerError)
		return
	}
	if ownerId != userId {
		http.Error(w, "Forbidden", http.StatusForbidden)
		return
	}

	_, err = db.db.Exec("DELETE FROM transaction_photos WHERE file_path = $1", payload.FilePath)
	if err != nil {
		log.Printf("Error deleting photo record: %v", err)
		http.Error(w, "Internal server error", http.StatusInternalServerError)
		return
	}

	if err := os.Remove(payload.FilePath); err != nil {
		log.Printf("Error deleting photo file: %v", err)
	}

	w.WriteHeader(http.StatusOK)
}

func (db WithDB) GetPhotoByPath(w http.ResponseWriter, r *http.Request, userId int) {
	encryptedUserId := r.PathValue("encrypted_user_id")
	encryptedTransactionId := r.PathValue("encrypted_transaction_id")
	fileName := r.PathValue("filename")

	decryptedUserIdStr, err := src.Decrypt(encryptedUserId)
	if err != nil {
		http.Error(w, "Invalid user ID", http.StatusBadRequest)
		return
	}
	decryptedUserId, err := strconv.Atoi(decryptedUserIdStr)
	if err != nil {
		http.Error(w, "Invalid user ID format", http.StatusBadRequest)
		return
	}

	decryptedTransactionIdStr, err := src.Decrypt(encryptedTransactionId)
	if err != nil {
		http.Error(w, "Invalid transaction ID", http.StatusBadRequest)
		return
	}
	decryptedTransactionId, err := strconv.ParseInt(decryptedTransactionIdStr, 10, 64)
	if err != nil {
		http.Error(w, "Invalid transaction ID format", http.StatusBadRequest)
		return
	}

	var ownerId int
	err = db.db.QueryRow(`
		SELECT t.user_id
		FROM transactions t
		WHERE t.transaction_id = $1 AND t.user_id = $2
	`, decryptedTransactionId, decryptedUserId).Scan(&ownerId)
	if err != nil {
		if err == sql.ErrNoRows {
			http.Error(w, "Transaction not found or does not belong to user", http.StatusNotFound)
			return
		}
		log.Printf("Error verifying transaction ownership: %v", err)
		http.Error(w, "Internal server error", http.StatusInternalServerError)
		return
	}

	// Now check if the logged-in user has access
	var hasAccess bool
	err = db.db.QueryRow(`
		SELECT true
		FROM transactions t
		WHERE t.transaction_id = $1
		AND (t.user_id = $2 OR $2 IN (SELECT user_id FROM user_connections WHERE connected_user_id = t.user_id))
	`, decryptedTransactionId, userId).Scan(&hasAccess)

	if err != nil || !hasAccess {
		http.Error(w, "Forbidden", http.StatusForbidden)
		return
	}

	filePath := filepath.Join("uploads", encryptedUserId, encryptedTransactionId, fileName)
	http.ServeFile(w, r, filePath)
}
