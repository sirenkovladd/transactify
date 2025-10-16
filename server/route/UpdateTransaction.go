package route

import (
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
		params = append(params, payload.ID, userId)

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
			http.Error(w, "Transaction not found", http.StatusNotFound)
			return
		}
	}

	w.WriteHeader(http.StatusOK)
}
