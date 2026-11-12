package httpapi

import (
	"context"
	"log/slog"
	"net/http"
	"time"
)

const readyTimeout = 2 * time.Second

// health is the liveness probe: the process is up.
func health(w http.ResponseWriter, _ *http.Request) {
	WriteJSON(w, http.StatusOK, map[string]string{"status": "ok"})
}

// readyz is the readiness probe: the database answers a ping.
func readyz(db Pinger, log *slog.Logger) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		if db == nil {
			WriteProblem(w, http.StatusServiceUnavailable, "database not configured")
			return
		}
		ctx, cancel := context.WithTimeout(r.Context(), readyTimeout)
		defer cancel()
		if err := db.Ping(ctx); err != nil {
			log.LogAttrs(r.Context(), slog.LevelWarn, "readiness check failed", slog.Any("error", err))
			WriteProblem(w, http.StatusServiceUnavailable, "database unavailable")
			return
		}
		WriteJSON(w, http.StatusOK, map[string]string{"status": "ready"})
	}
}
