package route

import (
	"database/sql"
	"encoding/json"
	"fmt"
	"log"
	"net/http"
	"strings"
)

type UpdateTransactionPayload struct {
	ID         int64    `json:"id"`
	Amount     *float64 `json:"amount"`
	Currency   *string  `json:"currency"`
	OccurredAt *string  `json:"occurredAt"`
	Merchant   *string  `json:"merchant"`
	Card       *string  `json:"card"`
	Category   *string  `json:"category"`
	Details    *string  `json:"details"`
	Tags       []string `json:"tags"`
}

func (db WithDB) UpdateTransaction(w http.ResponseWriter, r *http.Request, userId int) {
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

	// Check if the user has access to this transaction
	var transactionOwnerId int
	err := db.db.QueryRow("SELECT user_id FROM transactions WHERE transaction_id = $1", payload.ID).Scan(&transactionOwnerId)
	if err != nil {
		if err == sql.ErrNoRows {
			http.Error(w, "Transaction not found", http.StatusNotFound)
			return
		}
		log.Printf("Error querying transaction owner: %v", err)
		http.Error(w, "Failed to check transaction permissions", http.StatusInternalServerError)
		return
	}

	hasAccess := (userId == transactionOwnerId)
	if !hasAccess {
		var exists int
		err := db.db.QueryRow("SELECT 1 FROM user_connections WHERE user_id = $1 AND connected_user_id = $2", transactionOwnerId, userId).Scan(&exists)
		if err != nil && err != sql.ErrNoRows {
			log.Printf("Error checking user connection: %v", err)
			http.Error(w, "Failed to check transaction permissions", http.StatusInternalServerError)
			return
		}
		if err == nil {
			hasAccess = true
		}
	}

	if !hasAccess {
		http.Error(w, "You do not have permission to update this transaction", http.StatusForbidden)
		return
	}

	if payload.Tags != nil {
		tx, err := db.db.Begin()
		if err != nil {
			log.Printf("Error starting transaction for tags update: %v", err)
			http.Error(w, "Failed to update tags", http.StatusInternalServerError)
			return
		}
		defer tx.Rollback()

		// Get current tags
		rows, err := tx.Query("SELECT t.name, t.tag_id FROM tags t JOIN transaction_tags tt ON t.tag_id = tt.tag_id WHERE tt.transaction_id = $1", payload.ID)
		if err != nil {
			log.Printf("Error fetching current tags for transaction %d: %v", payload.ID, err)
			http.Error(w, "Failed to update tags", http.StatusInternalServerError)
			return
		}
		defer rows.Close()

		currentTags := make(map[string]int)
		for rows.Next() {
			var name string
			var id int
			if err := rows.Scan(&name, &id); err != nil {
				log.Printf("Error scanning current tag for transaction %d: %v", payload.ID, err)
				http.Error(w, "Failed to update tags", http.StatusInternalServerError)
				return
			}
			currentTags[name] = id
		}
		if rows.Err() != nil {
			log.Printf("Error iterating current tags for transaction %d: %v", payload.ID, rows.Err())
			http.Error(w, "Failed to update tags", http.StatusInternalServerError)
			return
		}

		newTags := make(map[string]bool)
		for _, tagName := range payload.Tags {
			if tagName != "" {
				newTags[tagName] = true
			}
		}

		// Tags to delete
		for tagName, tagId := range currentTags {
			if !newTags[tagName] {
				_, err := tx.Exec("DELETE FROM transaction_tags WHERE transaction_id = $1 AND tag_id = $2", payload.ID, tagId)
				if err != nil {
					log.Printf("Error deleting tag '%s' from transaction %d: %v", tagName, payload.ID, err)
					http.Error(w, "Failed to update tags", http.StatusInternalServerError)
					return
				}
			}
		}

		// Tags to add
		for tagName := range newTags {
			if _, exists := currentTags[tagName]; !exists {
				var tagId int
				err := tx.QueryRow("SELECT tag_id FROM tags WHERE name = $1 AND user_id = $2", tagName, transactionOwnerId).Scan(&tagId)
				if err == sql.ErrNoRows {
					err = tx.QueryRow("INSERT INTO tags (name, user_id) VALUES ($1, $2) RETURNING tag_id", tagName, transactionOwnerId).Scan(&tagId)
					if err != nil {
						log.Printf("Error creating new tag '%s': %v", tagName, err)
						http.Error(w, "Failed to update tags", http.StatusInternalServerError)
						return
					}
				} else if err != nil {
					log.Printf("Error querying for tag '%s': %v", tagName, err)
					http.Error(w, "Failed to update tags", http.StatusInternalServerError)
					return
				}

				_, err = tx.Exec("INSERT INTO transaction_tags (transaction_id, tag_id) VALUES ($1, $2)", payload.ID, tagId)
				if err != nil {
					log.Printf("Error associating tag '%s' with transaction %d: %v", tagName, payload.ID, err)
					http.Error(w, "Failed to update tags", http.StatusInternalServerError)
					return
				}
			}
		}

		if err := tx.Commit(); err != nil {
			log.Printf("Error committing tags update for transaction %d: %v", payload.ID, err)
			http.Error(w, "Failed to update tags", http.StatusInternalServerError)
			return
		}
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
		finalQuery += fmt.Sprintf(" WHERE transaction_id = $%d AND user_id = $%d", paramId, paramId+1)
		params = append(params, payload.ID, transactionOwnerId)

		res, err := db.db.Exec(finalQuery, params...)
		if err != nil {
			log.Printf("Error updating transaction %d: %v", payload.ID, err)
			http.Error(w, "Failed to update transaction", http.StatusInternalServerError)
			return
		}

		rowsAffected, err := res.RowsAffected()
		if err != nil {
			log.Printf("Error getting rows affected for transaction %d: %v", payload.ID, err)
			http.Error(w, "Failed to update transaction", http.StatusInternalServerError)
			return
		}

		if rowsAffected == 0 {
			http.Error(w, "Transaction not found or no changes to apply", http.StatusNotFound)
			return
		}
	}

	w.WriteHeader(http.StatusOK)
}
