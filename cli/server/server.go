package main

import (
	"database/sql"
	"fmt"
	"log"
	"net/http"
	"os"
	"strings"
	"time"

	"code.sirenko.ca/transaction/server"
	"code.sirenko.ca/transaction/server/route"

	_ "github.com/lib/pq"
)

type loggingResponseWriter struct {
	http.ResponseWriter
	statusCode int
}

func (lrw *loggingResponseWriter) WriteHeader(code int) {
	lrw.statusCode = code
	lrw.ResponseWriter.WriteHeader(code)
}

func LoggerMiddleware(next http.Handler) http.Handler {
	return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		timeStart := time.Now()
		// headers, err := json.Marshal(r.Header)
		// if err != nil {
		// 	log.Printf("Error marshaling headers: %v\n", err)
		// } else {
		// 	log.Printf("Headers: %s, %s\n", string(headers), r.Host)
		// }
		lrw := &loggingResponseWriter{w, http.StatusOK}
		ip := r.Header.Get("Cf-Connecting-Ip")
		if ip == "" {
			ip = r.RemoteAddr
		}
		next.ServeHTTP(lrw, r)
		log.Printf("%s %s - %s - %dms - HTTP-%d", r.Method, r.URL.Path, ip, time.Since(timeStart).Milliseconds(), lrw.statusCode)
	})
}

var (
	GitCommit = "-"
)

func main() {
	log.Printf("Init %s\n", GitCommit)

	user := os.Getenv("POSTGRES_USER")
	password := os.Getenv("POSTGRES_PASSWORD")
	dbname := os.Getenv("POSTGRES_DB")
	dbport := os.Getenv("POSTGRES_PORT")
	if dbport == "" {
		dbport = "5432"
	}
	db_host := os.Getenv("POSTGRES_HOST")
	connStr := fmt.Sprintf(
		"user=%s password='%s' host=%s port=%s dbname=%s sslmode=disable",
		user,
		strings.ReplaceAll(password, "'", "\\'"),
		db_host,
		dbport,
		dbname,
	)
	db, err := sql.Open("postgres", connStr)
	if err != nil {
		log.Fatal(err)
	}
	defer db.Close()

	server.ApplyMigrations(db)

	router := route.NewWithDB(db)

	port := os.Getenv("PORT")
	if port == "" {
		port = "8080"
	}

	log.Printf("listening on :%s...", port)

	protocol := os.Getenv("PROTOCOL")

	switch protocol {
	case "", "http":
		err = http.ListenAndServe(fmt.Sprintf(":%s", port), LoggerMiddleware(router.GetMux()))
	case "https":
		certFile := os.Getenv("CERT_FILE")
		keyFile := os.Getenv("KEY_FILE")
		err = http.ListenAndServeTLS(fmt.Sprintf(":%s", port), certFile, keyFile, LoggerMiddleware(router.GetMux()))
	default:
		err = fmt.Errorf("unknown protocol: %s", protocol)
	}
	if err != nil {
		panic(err)
	}
}
