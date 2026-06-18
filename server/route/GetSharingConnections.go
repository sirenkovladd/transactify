package route

import (
	"encoding/json"
	"log"
	"net/http"
)

func (h WithStore) GetSharingConnections(w http.ResponseWriter, r *http.Request, userId uint64) {
	if r.Method != http.MethodGet {
		http.Error(w, "Method not allowed", http.StatusMethodNotAllowed)
		return
	}

	connected, err := h.s.ListConnectedUserIDs(userId)
	if err != nil {
		log.Printf("Error querying sharing connections for user %d: %v", userId, err)
		http.Error(w, "Failed to query sharing connections", http.StatusInternalServerError)
		return
	}

	names := make([]string, 0, len(connected))
	for _, cid := range connected {
		u, err := h.s.GetUserByID(cid)
		if err != nil {
			log.Printf("Error looking up user %d: %v", cid, err)
			continue
		}
		names = append(names, u.PersonName)
	}

	w.Header().Set("Content-Type", "application/json")
	json.NewEncoder(w).Encode(names)
}
