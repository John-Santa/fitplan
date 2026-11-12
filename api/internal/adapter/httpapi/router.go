// Package httpapi is the HTTP adapter: chi routing, middleware, problem+json
// errors, and the handlers with their wire DTOs.
package httpapi

import (
	"context"
	"log/slog"
	"net/http"
	"strings"

	"github.com/go-chi/chi/v5"
	"github.com/go-chi/chi/v5/middleware"

	"github.com/John-Santa/fitplan/api/internal/port"
)

// Pinger reports whether a dependency (the database) is reachable.
type Pinger interface {
	Ping(ctx context.Context) error
}

// RouterConfig holds the dependencies of the router.
type RouterConfig struct {
	Logger         *slog.Logger
	AllowedOrigins []string
	// Authenticator verifies credentials; nil rejects every protected route.
	Authenticator port.Authenticator
	// Sync serves /v1/sync and /v1/me; nil leaves the /v1 routes unmounted
	// (no database configured).
	Sync SyncService
	// Readiness is pinged by /readyz; nil answers 503.
	Readiness Pinger
	// RateLimit tunes the per-user limit on /v1/*; zero fields take defaults.
	RateLimit RateLimitConfig
	// Extra registers additional routes (tests only).
	Extra func(r chi.Router)
}

// NewRouter builds the router. Middleware order, outermost first:
// RequestID → SecurityHeaders → Logger → Recover → CORS → Auth → RateLimit → Timeout. The logger sees the final
// status of recovered panics; CORS headers are set before Auth and the
// handlers run, so 401 and 500 answers still carry them and preflights are
// answered without credentials.
func NewRouter(cfg RouterConfig) http.Handler {
	log := cfg.Logger
	if log == nil {
		log = slog.Default()
	}
	r := chi.NewRouter()
	r.Use(requestID)
	r.Use(securityHeaders)
	r.Use(requestLogger(log))
	r.Use(recoverer(log))
	r.Use(cors(cfg.AllowedOrigins))
	r.Use(authenticate(cfg.Authenticator, r))
	r.Use(rateLimit(cfg.RateLimit))
	r.Use(middleware.Timeout(handlerTimeout))
	r.Use(middleware.GetHead)

	r.NotFound(func(w http.ResponseWriter, _ *http.Request) {
		WriteProblem(w, http.StatusNotFound, http.StatusText(http.StatusNotFound))
	})
	r.MethodNotAllowed(func(w http.ResponseWriter, req *http.Request) {
		if allow := allowedMethods(r, req.URL.Path); len(allow) > 0 {
			w.Header().Set("Allow", strings.Join(allow, ", "))
		}
		WriteProblem(w, http.StatusMethodNotAllowed, http.StatusText(http.StatusMethodNotAllowed))
	})

	r.Get("/health", health)
	r.Get("/readyz", readyz(cfg.Readiness, log))
	if cfg.Sync != nil {
		s := syncHandlers{svc: cfg.Sync, log: log}
		r.Get("/v1/me", s.me)
		r.Get("/v1/sync", s.pull)
		r.Post("/v1/sync", s.push)
	}
	if cfg.Extra != nil {
		cfg.Extra(r)
	}
	return r
}
