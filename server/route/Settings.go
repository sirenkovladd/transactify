package route

import (
	"encoding/json"
	"log"
	"net/http"
)

func (db WithDB) GetSettings(w http.ResponseWriter, r *http.Request, userId int) {
	key := r.URL.Query().Get("key")
	if key == "" {
		// Return all settings
		rows, err := db.db.Query("SELECT key, value FROM settings")
		if err != nil {
			log.Printf("Error querying settings: %v", err)
			http.Error(w, "Failed to query settings", http.StatusInternalServerError)
			return
		}
		defer rows.Close()

		settings := make(map[string]interface{})
		for rows.Next() {
			var k string
			var v []byte
			if err := rows.Scan(&k, &v); err != nil {
				log.Printf("Error scanning settings: %v", err)
				http.Error(w, "Failed to scan settings", http.StatusInternalServerError)
				return
			}
			var val interface{}
			if err := json.Unmarshal(v, &val); err != nil {
				log.Printf("Error unmarshaling settings: %v", err)
				http.Error(w, "Failed to unmarshal settings", http.StatusInternalServerError)
				return
			}
			settings[k] = val
		}
		w.Header().Set("Content-Type", "application/json")
		json.NewEncoder(w).Encode(settings)
		return
	}

	var value []byte
	err := db.db.QueryRow("SELECT value FROM settings WHERE key = $1", key).Scan(&value)
	if err != nil {
		http.Error(w, "Setting not found", http.StatusNotFound)
		return
	}

	w.Header().Set("Content-Type", "application/json")
	w.Write(value)
}

func (db WithDB) UpdateSetting(w http.ResponseWriter, r *http.Request, userId int) {
	if r.Method != http.MethodPost {
		http.Error(w, "Method not allowed", http.StatusMethodNotAllowed)
		return
	}

	key := r.URL.Query().Get("key")
	if key == "" {
		http.Error(w, "Key is required", http.StatusBadRequest)
		return
	}

	var value interface{}
	if err := json.NewDecoder(r.Body).Decode(&value); err != nil {
		http.Error(w, "Invalid JSON", http.StatusBadRequest)
		return
	}

	jsonValue, err := json.Marshal(value)
	if err != nil {
		http.Error(w, "Failed to marshal JSON", http.StatusInternalServerError)
		return
	}

	_, err = db.db.Exec("INSERT INTO settings (key, value, updated_at) VALUES ($1, $2, now()) ON CONFLICT (key) DO UPDATE SET value = EXCLUDED.value, updated_at = now()", key, jsonValue)
	if err != nil {
		log.Printf("Error updating setting %s: %v", key, err)
		http.Error(w, "Failed to update setting", http.StatusInternalServerError)
		return
	}

	w.WriteHeader(http.StatusOK)
}
