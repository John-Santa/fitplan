package httpapi

import (
	"crypto/rand"
	"encoding/hex"
	"log/slog"
	"net/http"
	"runtime/debug"
	"slices"
	"time"

	"github.com/go-chi/chi/v5"

	"github.com/John-Santa/fitplan/api/internal/platform/logging"
	"github.com/John-Santa/fitplan/api/internal/port"
)

const requestIDHeader = "X-Request-ID"

// publicPaths are served without authentication. Every other routed path
// requires a valid Bearer token; unrouted requests fall through to 404/405.
var publicPaths = []string{"/health", "/readyz"}

// handlerTimeout bounds the work of one request. It stays below the server
// WriteTimeout so database calls are cancelled before the connection is cut.
const handlerTimeout = 25 * time.Second

// securityHeaders sets the response headers every API answer carries. The API
// serves JSON only, so the policy forbids loading or framing anything, and
// personal data must not be kept by browser or intermediary caches.
func securityHeaders(next http.Handler) http.Handler {
	return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		h := w.Header()
		h.Set("X-Content-Type-Options", "nosniff")
		h.Set("Strict-Transport-Security", "max-age=31536000; includeSubDomains")
		h.Set("Content-Security-Policy", "default-src 'none'; frame-ancestors 'none'")
		h.Set("Referrer-Policy", "no-referrer")
		h.Set("Cache-Control", "no-store")
		next.ServeHTTP(w, r)
	})
}

// safeRequestID reports whether id is 1 to 128 characters of [A-Za-z0-9._-],
// the only incoming values echoed back and written to the logs.
func safeRequestID(id string) bool {
	if id == "" || len(id) > 128 {
		return false
	}
	for _, c := range []byte(id) {
		switch {
		case c >= 'a' && c <= 'z', c >= 'A' && c <= 'Z', c >= '0' && c <= '9', c == '.', c == '_', c == '-':
		default:
			return false
		}
	}
	return true
}

// requestID reuses a safe incoming X-Request-ID or generates one, echoes it
// back, and stores it in the context for the logger.
func requestID(next http.Handler) http.Handler {
	return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		id := r.Header.Get(requestIDHeader)
		if !safeRequestID(id) {
			id = newID()
			r.Header.Set(requestIDHeader, id)
		}
		w.Header().Set(requestIDHeader, id)
		next.ServeHTTP(w, r.WithContext(logging.WithRequestID(r.Context(), id)))
	})
}

func newID() string {
	var b [12]byte
	_, _ = rand.Read(b[:])
	return hex.EncodeToString(b[:])
}

type statusRecorder struct {
	http.ResponseWriter
	status int
	wrote  bool
}

// WriteHeader forwards only the first status. A later call, such as the
// deadline middleware's 504 after a handler already answered, would only make
// net/http log a superfluous WriteHeader line.
func (r *statusRecorder) WriteHeader(code int) {
	if r.wrote {
		return
	}
	r.status = code
	r.wrote = true
	r.ResponseWriter.WriteHeader(code)
}

func (r *statusRecorder) Write(b []byte) (int, error) {
	if !r.wrote {
		r.WriteHeader(http.StatusOK)
	}
	return r.ResponseWriter.Write(b)
}

// Unwrap lets http.ResponseController reach the underlying writer.
func (r *statusRecorder) Unwrap() http.ResponseWriter { return r.ResponseWriter }

// requestLogger logs one structured line per request; request_id comes from
// the context through the logging handler.
func requestLogger(log *slog.Logger) func(http.Handler) http.Handler {
	return func(next http.Handler) http.Handler {
		return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
			start := time.Now()
			rec := &statusRecorder{ResponseWriter: w, status: http.StatusOK}
			next.ServeHTTP(rec, r)
			log.LogAttrs(r.Context(), slog.LevelInfo, "request",
				slog.String("method", r.Method),
				slog.String("path", r.URL.Path),
				slog.Int("status", rec.status),
				slog.Float64("duration_ms", float64(time.Since(start).Microseconds())/1000),
			)
		})
	}
}

// recoverer turns panics into a problem 500 and logs the stack trace. It sits
// outside CORS, which sets its headers before calling the handler, so a 500
// still carries them.
func recoverer(log *slog.Logger) func(http.Handler) http.Handler {
	return func(next http.Handler) http.Handler {
		return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
			defer func() {
				v := recover()
				if v == nil {
					return
				}
				if v == http.ErrAbortHandler { //nolint:errorlint // sentinel panic value, compared as in net/http
					panic(v)
				}
				log.LogAttrs(r.Context(), slog.LevelError, "panic recovered",
					slog.Any("panic", v),
					slog.String("stack", string(debug.Stack())),
				)
				WriteProblem(w, http.StatusInternalServerError, "internal server error")
			}()
			next.ServeHTTP(w, r)
		})
	}
}

const (
	corsMethods = "GET, POST, PUT, PATCH, DELETE, OPTIONS"
	corsHeaders = "Authorization, Content-Type"
	corsMaxAge  = "600"
	// corsExpose lets a cross-origin page read Retry-After on a 429.
	corsExpose = "Retry-After"
)

// cors allows cross-origin requests only from the configured origins and
// answers preflight requests itself (403 for a denied origin).
func cors(allowed []string) func(http.Handler) http.Handler {
	return func(next http.Handler) http.Handler {
		return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
			origin := r.Header.Get("Origin")
			if origin == "" {
				next.ServeHTTP(w, r)
				return
			}
			w.Header().Add("Vary", "Origin")
			ok := slices.Contains(allowed, origin)
			if ok {
				w.Header().Set("Access-Control-Allow-Origin", origin)
				w.Header().Set("Access-Control-Expose-Headers", corsExpose)
			}
			isPreflight := r.Method == http.MethodOptions && r.Header.Get("Access-Control-Request-Method") != ""
			if isPreflight {
				if !ok {
					WriteProblem(w, http.StatusForbidden, "origin not allowed")
					return
				}
				w.Header().Add("Vary", "Access-Control-Request-Method")
				w.Header().Add("Vary", "Access-Control-Request-Headers")
				w.Header().Set("Access-Control-Allow-Methods", corsMethods)
				w.Header().Set("Access-Control-Allow-Headers", corsHeaders)
				w.Header().Set("Access-Control-Max-Age", corsMaxAge)
				w.WriteHeader(http.StatusNoContent)
				return
			}
			next.ServeHTTP(w, r)
		})
	}
}

// authenticate guards every routed, non-public request: it answers 401 before
// the handler runs. With no Authenticator configured it rejects them all.
// It sits inside CORS so 401s carry CORS headers the browser can read.
func authenticate(a port.Authenticator, mux *chi.Mux) func(http.Handler) http.Handler {
	return func(next http.Handler) http.Handler {
		var guarded http.Handler = http.HandlerFunc(writeUnauthorized)
		if a != nil {
			guarded = a.Authenticate(next, http.HandlerFunc(writeUnauthorized))
		}
		return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
			if slices.Contains(publicPaths, r.URL.Path) || !routed(mux, r) {
				next.ServeHTTP(w, r)
				return
			}
			guarded.ServeHTTP(w, r)
		})
	}
}

// routed reports whether mux has a route for the request (HEAD counts as GET).
func routed(mux *chi.Mux, r *http.Request) bool {
	if mux.Match(chi.NewRouteContext(), r.Method, r.URL.Path) {
		return true
	}
	return r.Method == http.MethodHead && mux.Match(chi.NewRouteContext(), http.MethodGet, r.URL.Path)
}

// allowedMethods lists the methods routed for path, for the Allow header.
func allowedMethods(mux *chi.Mux, path string) []string {
	var out []string
	for _, m := range []string{http.MethodGet, http.MethodHead, http.MethodPost, http.MethodPut, http.MethodPatch, http.MethodDelete} {
		probe := m
		if m == http.MethodHead {
			probe = http.MethodGet
		}
		if mux.Match(chi.NewRouteContext(), probe, path) {
			out = append(out, m)
		}
	}
	return out
}
