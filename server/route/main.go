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
	files, err := root.WebContent.ReadDir("dist")
	if root.Production && (err == nil || len(files) != 0) {
		return http.FS(PrefixFS{"dist", http.FS(root.WebContent)})
	}
	if err != nil {
		fmt.Println(err)
	}
	fmt.Println("Use hot reload for files")
	return http.Dir("./dist")
}

func (db WithDB) GetMux() http.Handler {
	mux := http.NewServeMux()
	mux.HandleFunc("/api/login", db.Login)
	mux.Handle("/api/transactions/add", db.AuthMiddleware(db.AddTransactions))
	mux.Handle("/api/transactions", db.AuthMiddleware(db.GetTransactions))
	mux.Handle("/api/transaction/update", db.AuthMiddleware(db.UpdateTransaction))
	mux.Handle("/api/transaction/delete", db.AuthMiddleware(db.DeleteTransaction))
	mux.Handle("/api/transactions/tags", db.AuthMiddleware(db.ManageTags))
	mux.Handle("/api/transactions/category", db.AuthMiddleware(db.ManageCategory))
	mux.Handle("/api/categories", db.AuthMiddleware(db.GetCategories))
	mux.Handle("/api/sharing/token", db.AuthMiddleware(db.GenerateSharingToken))
	mux.Handle("/api/sharing/connections", db.AuthMiddleware(db.GetSharingConnections))
	mux.Handle("/api/sharing/connections/add", db.AuthMiddleware(db.AddSharingConnection))
	mux.Handle("/api/sharing/token/revoke", db.AuthMiddleware(db.RevokeSharingToken))
	mux.Handle("/api/sharing/tokens", db.AuthMiddleware(db.GetSharingTokens))
	mux.Handle("/api/sharing/subscriptions", db.AuthMiddleware(db.GetSubscriptions))
	mux.Handle("/api/sharing/unsubscribe", db.AuthMiddleware(db.Unsubscribe))
	mux.Handle("/", http.FileServer(getFileSystem()))

	return mux
}
