package server

import (
	"database/sql"
	"fmt"
	"log"
	"os"
	"path/filepath"
	"sort"
)

func ApplyMigrations(db *sql.DB) {
	_, err := db.Exec(`CREATE TABLE IF NOT EXISTS schema_migrations (version VARCHAR(255) PRIMARY KEY)`)
	if err != nil {
		log.Fatalf("Failed to create schema_migrations table: %v", err)
	}

	files, err := filepath.Glob("cli/server/migrations/*.sql")
	if err != nil {
		log.Fatalf("Failed to find migration files: %v", err)
	}

	sort.Strings(files)

	for _, file := range files {
		fileName := filepath.Base(file)
		fmt.Println(fileName)
		var version string
		err := db.QueryRow("SELECT version FROM schema_migrations WHERE version = $1", fileName).Scan(&version)
		if err != nil && err != sql.ErrNoRows {
			log.Fatalf("Failed to query schema_migrations table: %v", err)
		}

		if version == fileName {
			log.Printf("Migration %s already applied", file)
			continue
		}

		log.Printf("Applying migration %s", file)
		content, err := os.ReadFile(file)
		if err != nil {
			log.Fatalf("Failed to read migration file %s: %v", file, err)
		}

		tx, err := db.Begin()
		if err != nil {
			log.Fatalf("Failed to begin transaction: %v", err)
		}

		_, err = tx.Exec(string(content))
		if err != nil {
			tx.Rollback()
			log.Fatalf("Failed to apply migration %s: %v", file, err)
		}

		_, err = tx.Exec("INSERT INTO schema_migrations (version) VALUES ($1)", fileName)
		if err != nil {
			tx.Rollback()
			log.Fatalf("Failed to record migration %s: %v", file, err)
		}

		if err := tx.Commit(); err != nil {
			log.Fatalf("Failed to commit transaction: %v", err)
		}
	}
}
