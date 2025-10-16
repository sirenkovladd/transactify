package main

import (
	"database/sql"
	"fmt"
	"log"
	"net/http"
	"os"
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
		lrw := &loggingResponseWriter{w, http.StatusOK}
		next.ServeHTTP(lrw, r)
		log.Printf("%s %s - %s - %dms - HTTP-%d", r.Method, r.URL.Path, r.RemoteAddr, time.Since(timeStart).Milliseconds(), lrw.statusCode)
	})
}

func main() {
	log.Println("Init")
	user := os.Getenv("POSTGRES_USER")
	password := os.Getenv("POSTGRES_PASSWORD")
	dbname := os.Getenv("POSTGRES_DB")
	db_host := os.Getenv("POSTGRES_HOST")
	connStr := fmt.Sprintf("postgres://%s:%s@%s:5432/%s?sslmode=disable", user, password, db_host, dbname)
	db, err := sql.Open("postgres", connStr)
	if err != nil {
		log.Fatal(err)
	}
	defer db.Close()

	server.ApplyMigrations(db)

	router := route.NewWithDB(db)

	log.Print("listening on :8080...")
	err = http.ListenAndServe(":8080", LoggerMiddleware(router.GetMux()))
	if err != nil {
		panic(err)
	}
}
