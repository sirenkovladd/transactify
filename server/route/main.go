package route

import (
	"crypto/rand"
	"database/sql"
	"encoding/hex"
	"fmt"
	"io/fs"
	"net/http"
	"path"

	root "code.sirenko.ca/transaction"
	"code.sirenko.ca/transaction/server"
)

type WithDB struct {
	db *sql.DB
}

func NewWithDB(db *sql.DB) WithDB {
	return WithDB{db: db}
}

func generateSecureToken(length int) (string, error) {
	bytes := make([]byte, length)
	if _, err := rand.Read(bytes); err != nil {
		return "", err
	}
	return hex.EncodeToString(bytes), nil
}

type PrefixFS struct {
	prefix string
	fs     http.FileSystem
}

func (pfs PrefixFS) Open(name string) (fs.File, error) {
	return pfs.fs.Open(path.Join(pfs.prefix, name))
}

func getFileSystem() http.FileSystem {
	if server.Production {
		return http.FS(PrefixFS{"dist", http.FS(root.WebContent)})
	}
	fmt.Println("Use hot reload for files")
	return http.Dir("./dist")
}

func (db WithDB) GetMux() http.Handler {
	mux := http.NewServeMux()
	a := db.AuthMiddleware

	mux.HandleFunc("/api/login", db.Login)
	mux.Handle("POST /api/transaction/{id}/photo", a(db.AttachPhoto))
	mux.Handle("DELETE /api/photo", a(db.DeletePhotoByPath))
	mux.Handle("GET /uploads/transaction/{encrypted_user_id}/{encrypted_transaction_id}/{filename}", a(db.GetPhotoByPath))
	mux.Handle("/api/transactions/add", a(db.AddTransactions))
	mux.Handle("/api/transactions", a(db.GetTransactions))
	mux.Handle("/api/transaction/update", a(db.UpdateTransaction))
	mux.Handle("/api/transaction/delete", a(db.DeleteTransaction))
	mux.Handle("/api/transactions/tags", a(db.ManageTags))
	mux.Handle("/api/transactions/category", a(db.ManageCategory))
	mux.Handle("/api/categories", a(db.GetCategories))
	mux.Handle("/api/sharing/token", a(db.GenerateSharingToken))
	mux.Handle("/api/sharing/connections", a(db.GetSharingConnections))
	mux.Handle("/api/sharing/connections/add", a(db.AddSharingConnection))
	mux.Handle("/api/sharing/token/revoke", a(db.RevokeSharingToken))
	mux.Handle("/api/sharing/tokens", a(db.GetSharingTokens))
	mux.Handle("/api/sharing/subscriptions", a(db.GetSubscriptions))
	mux.Handle("/api/sharing/unsubscribe", a(db.Unsubscribe))
	mux.Handle("/api/logout", a(db.Logout))
	mux.Handle("/", http.FileServer(getFileSystem()))

	return mux
}
