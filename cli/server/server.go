package main

import (
	"fmt"
	"log"
	"net/http"
	"os"
	"time"

	"code.sirenko.ca/transaction/server"
	"code.sirenko.ca/transaction/server/route"
	"code.sirenko.ca/transaction/store"
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
	BuildTime = "-"
)

func main() {
	log.Printf("Init %s (built: %s)\n", GitCommit, BuildTime)

	// Set the build time in the server package for use in route handlers
	server.BuildTime = BuildTime

	path := os.Getenv("BBOLT_PATH")
	if path == "" {
		path = "./data/transaction.db"
	}
	s, err := store.Open(path)
	if err != nil {
		log.Fatal(err)
	}
	defer s.Close()

	if err := server.ApplyMigrationsBbolt(s); err != nil {
		log.Fatal(err)
	}

	router := route.NewWithStore(s)

	port := os.Getenv("PORT")
	if port == "" {
		port = "8080"
	}
	log.Printf("listening on :%s...", port)
	log.Printf("using bbolt at %s", path)

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
