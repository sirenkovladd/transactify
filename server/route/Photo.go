package route

import (
	"crypto/rand"
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
	"code.sirenko.ca/transaction/store"
)

var allowedExtensions = map[string]bool{
	".jpg":  true,
	".jpeg": true,
	".png":  true,
}

type DeletePhotoPayload struct {
	FilePath string `json:"filePath"`
}

func (h WithStore) AttachPhoto(w http.ResponseWriter, r *http.Request, userId uint64) {
	transactionIdStr := r.PathValue("id")
	if transactionIdStr == "" {
		http.Error(w, "Transaction ID is required", http.StatusBadRequest)
		return
	}
	transactionId, err := strconv.ParseUint(transactionIdStr, 10, 64)
	if err != nil {
		http.Error(w, "Invalid Transaction ID", http.StatusBadRequest)
		return
	}

	t, err := h.s.GetTransaction(transactionId)
	if err != nil {
		if err == store.ErrNotFound {
			http.Error(w, "Transaction not found", http.StatusNotFound)
			return
		}
		log.Printf("Error checking transaction ownership: %v", err)
		http.Error(w, "Internal server error", http.StatusInternalServerError)
		return
	}
	if t.UserID != userId {
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

	encryptedUserId, err := src.Encrypt(strconv.FormatUint(userId, 10))
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

	photo := &store.Photo{
		TransactionID: transactionId,
		FilePath:      filePath,
	}
	if err := h.s.CreatePhoto(photo); err != nil {
		log.Printf("Failed to create photo record: %v", err)
		http.Error(w, "Failed to create photo record", http.StatusInternalServerError)
		return
	}

	dst, err := os.Create(filePath)
	if err != nil {
		// Roll back the photo record since the file write failed.
		_ = h.s.DeletePhotoByPath(filePath)
		http.Error(w, "Unable to create the file for writing", http.StatusInternalServerError)
		return
	}
	defer dst.Close()

	if _, err := io.Copy(dst, file); err != nil {
		_ = h.s.DeletePhotoByPath(filePath)
		_ = os.Remove(filePath)
		http.Error(w, "Unable to save the file", http.StatusInternalServerError)
		return
	}

	w.Header().Set("Content-Type", "application/json")
	json.NewEncoder(w).Encode(map[string]interface{}{
		"photoUrl": fmt.Sprintf("/uploads/transaction/%s/%s/%s", encryptedUserId, encryptedTransactionId, fileName),
	})
}

func (h WithStore) DeletePhotoByPath(w http.ResponseWriter, r *http.Request, userId uint64) {
	var payload DeletePhotoPayload
	if err := json.NewDecoder(r.Body).Decode(&payload); err != nil {
		http.Error(w, "Invalid request body", http.StatusBadRequest)
		return
	}

	photo, err := h.s.GetPhotoByPath(payload.FilePath)
	if err != nil {
		if err == store.ErrNotFound {
			http.Error(w, "Photo not found", http.StatusNotFound)
			return
		}
		log.Printf("Error finding photo: %v", err)
		http.Error(w, "Internal server error", http.StatusInternalServerError)
		return
	}

	t, err := h.s.GetTransaction(photo.TransactionID)
	if err != nil {
		log.Printf("Error checking transaction ownership: %v", err)
		http.Error(w, "Internal server error", http.StatusInternalServerError)
		return
	}
	if t.UserID != userId {
		http.Error(w, "Forbidden", http.StatusForbidden)
		return
	}

	if err := h.s.DeletePhotoByPath(payload.FilePath); err != nil {
		log.Printf("Error deleting photo record: %v", err)
		http.Error(w, "Internal server error", http.StatusInternalServerError)
		return
	}

	if err := os.Remove(payload.FilePath); err != nil {
		log.Printf("Error deleting photo file: %v", err)
	}

	w.WriteHeader(http.StatusOK)
}

func (h WithStore) GetPhotoByPath(w http.ResponseWriter, r *http.Request, userId uint64) {
	encryptedUserId := r.PathValue("encrypted_user_id")
	encryptedTransactionId := r.PathValue("encrypted_transaction_id")
	fileName := r.PathValue("filename")

	decryptedUserIdStr, err := src.Decrypt(encryptedUserId)
	if err != nil {
		http.Error(w, "Invalid user ID", http.StatusBadRequest)
		return
	}
	decryptedUserId, err := strconv.ParseUint(decryptedUserIdStr, 10, 64)
	if err != nil {
		http.Error(w, "Invalid user ID format", http.StatusBadRequest)
		return
	}

	decryptedTransactionIdStr, err := src.Decrypt(encryptedTransactionId)
	if err != nil {
		http.Error(w, "Invalid transaction ID", http.StatusBadRequest)
		return
	}
	decryptedTransactionId, err := strconv.ParseUint(decryptedTransactionIdStr, 10, 64)
	if err != nil {
		http.Error(w, "Invalid transaction ID format", http.StatusBadRequest)
		return
	}

	// The decrypted user ID is the owner of the photo's transaction.
	owner, err := h.s.GetTransaction(decryptedTransactionId)
	if err != nil {
		if err == store.ErrNotFound {
			http.Error(w, "Transaction not found or does not belong to user", http.StatusNotFound)
			return
		}
		log.Printf("Error verifying transaction ownership: %v", err)
		http.Error(w, "Internal server error", http.StatusInternalServerError)
		return
	}
	if owner.UserID != decryptedUserId {
		http.Error(w, "Transaction not found or does not belong to user", http.StatusNotFound)
		return
	}

	// Now check if the logged-in user has access: owner or a subscriber.
	// Mirrors the original SQL: `$2 IN (SELECT user_id FROM user_connections
	// WHERE connected_user_id = t.user_id)` — i.e., the logged-in user has
	// added the owner as a connection, which is exactly the "subscriber of
	// the owner" relationship.
	hasAccess := userId == owner.UserID
	if !hasAccess {
		subscribers, err := h.s.ListSubscribers(owner.UserID)
		if err != nil {
			log.Printf("Error checking access: %v", err)
			http.Error(w, "Internal server error", http.StatusInternalServerError)
			return
		}
		for _, sid := range subscribers {
			if sid == userId {
				hasAccess = true
				break
			}
		}
	}

	if !hasAccess {
		http.Error(w, "Forbidden", http.StatusForbidden)
		return
	}

	filePath := filepath.Join("uploads", encryptedUserId, encryptedTransactionId, fileName)
	http.ServeFile(w, r, filePath)
}
