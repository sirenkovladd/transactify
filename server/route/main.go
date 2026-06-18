package route

import (
	"crypto/rand"
	"encoding/hex"
	"fmt"
	"io"
	"io/fs"
	"net/http"
	"path"
	"time"

	root "code.sirenko.ca/transaction"
	"code.sirenko.ca/transaction/server"
	"code.sirenko.ca/transaction/store"
)

type WithStore struct {
	s *store.Store
}

func NewWithStore(s *store.Store) WithStore {
	return WithStore{s: s}
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

// modTimeFile wraps fs.File to override ModTime
type modTimeFile struct {
	fs.File
	modTime time.Time
}

func (f modTimeFile) Stat() (fs.FileInfo, error) {
	info, err := f.File.Stat()
	if err != nil {
		return nil, err
	}
	return modTimeFileInfo{info, f.modTime}, nil
}

func (f modTimeFile) Readdir(count int) ([]fs.FileInfo, error) {
	// Type assert to http.File to access Readdir
	if httpFile, ok := f.File.(http.File); ok {
		infos, err := httpFile.Readdir(count)
		if err != nil {
			return nil, err
		}
		// Wrap each FileInfo with our custom modTime
		wrapped := make([]fs.FileInfo, len(infos))
		for i, info := range infos {
			wrapped[i] = modTimeFileInfo{info, f.modTime}
		}
		return wrapped, nil
	}
	return nil, nil
}

func (f modTimeFile) Seek(offset int64, whence int) (int64, error) {
	// Type assert to io.Seeker to access Seek
	if seeker, ok := f.File.(io.Seeker); ok {
		return seeker.Seek(offset, whence)
	}
	return 0, nil
}

// modTimeFileInfo wraps fs.FileInfo to override ModTime
type modTimeFileInfo struct {
	fs.FileInfo
	modTime time.Time
}

func (fi modTimeFileInfo) ModTime() time.Time {
	return fi.modTime
}

// modTimeFS wraps http.FileSystem to set a fixed modification time for all files
type modTimeFS struct {
	fs      http.FileSystem
	modTime time.Time
}

func (mtfs modTimeFS) Open(name string) (http.File, error) {
	f, err := mtfs.fs.Open(name)
	if err != nil {
		return nil, err
	}
	return modTimeFile{f, mtfs.modTime}, nil
}

func getFileSystem() http.FileSystem {
	if server.Production {
		// Parse the build time from the server package
		// Format is RFC3339: 2024-01-01T00:00:00Z
		modTime := time.Time{}
		if server.BuildTime != "-" {
			if parsedTime, err := time.Parse(time.RFC3339, server.BuildTime); err == nil {
				modTime = parsedTime
			}
		}
		return modTimeFS{
			fs:      http.FS(PrefixFS{"dist", http.FS(root.WebContent)}),
			modTime: modTime,
		}
	}
	fmt.Println("Use hot reload for files")
	return http.Dir("./dist")
}

func (h WithStore) GetMux() http.Handler {
	mux := http.NewServeMux()
	a := h.AuthMiddleware

	mux.HandleFunc("/api/login", h.Login)
	mux.Handle("POST /api/transaction/{id}/photo", a(h.AttachPhoto))
	mux.Handle("DELETE /api/photo", a(h.DeletePhotoByPath))
	mux.Handle("GET /uploads/transaction/{encrypted_user_id}/{encrypted_transaction_id}/{filename}", a(h.GetPhotoByPath))
	mux.Handle("/api/transactions/add", a(h.AddTransactions))
	mux.Handle("/api/transactions", a(h.GetTransactions))
	mux.Handle("/api/transaction/update", a(h.UpdateTransaction))
	mux.Handle("/api/transaction/delete", a(h.DeleteTransaction))
	mux.Handle("/api/transactions/tags", a(h.ManageTags))
	mux.Handle("/api/transactions/category", a(h.ManageCategory))
	mux.Handle("/api/categories", a(h.GetCategories))
	mux.Handle("/api/sharing/token", a(h.GenerateSharingToken))
	mux.Handle("/api/sharing/connections", a(h.GetSharingConnections))
	mux.Handle("/api/sharing/connections/add", a(h.AddSharingConnection))
	mux.Handle("/api/sharing/token/revoke", a(h.RevokeSharingToken))
	mux.Handle("/api/sharing/tokens", a(h.GetSharingTokens))
	mux.Handle("/api/sharing/subscriptions", a(h.GetSubscriptions))
	mux.Handle("/api/sharing/unsubscribe", a(h.Unsubscribe))
	mux.Handle("GET /api/settings", a(h.GetSettings))
	mux.Handle("POST /api/settings", a(h.UpdateSetting))
	mux.Handle("/api/logout", a(h.Logout))
	mux.Handle("/", http.FileServer(getFileSystem()))

	return mux
}
