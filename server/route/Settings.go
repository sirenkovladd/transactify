package route

import (
	"encoding/json"
	"log"
	"net/http"
)

func (h WithStore) GetSettings(w http.ResponseWriter, r *http.Request, userId uint64) {
	key := r.URL.Query().Get("key")
	if key == "" {
		settings, err := h.s.GetAllSettings()
		if err != nil {
			log.Printf("Error querying settings: %v", err)
			http.Error(w, "Failed to query settings", http.StatusInternalServerError)
			return
		}
		w.Header().Set("Content-Type", "application/json")
		_ = json.NewEncoder(w).Encode(settings)
		return
	}

	value, err := h.s.GetSetting(key)
	if err != nil {
		http.Error(w, "Setting not found", http.StatusNotFound)
		return
	}

	w.Header().Set("Content-Type", "application/json")
	_, _ = w.Write(value)
}

func (h WithStore) UpdateSetting(w http.ResponseWriter, r *http.Request, userId uint64) {
	if r.Method != http.MethodPost {
		http.Error(w, "Method not allowed", http.StatusMethodNotAllowed)
		return
	}

	key := r.URL.Query().Get("key")
	if key == "" {
		http.Error(w, "Key is required", http.StatusBadRequest)
		return
	}

	var value json.RawMessage
	if err := json.NewDecoder(r.Body).Decode(&value); err != nil {
		http.Error(w, "Invalid JSON", http.StatusBadRequest)
		return
	}

	if err := h.s.SetSetting(key, value); err != nil {
		log.Printf("Error updating setting %s: %v", key, err)
		http.Error(w, "Failed to update setting", http.StatusInternalServerError)
		return
	}

	w.WriteHeader(http.StatusOK)
}
