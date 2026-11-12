// Package httpapi is the HTTP adapter: routing, middleware and JSON helpers.
package httpapi

import (
	"log/slog"
	"net/http"
)

// Options configures the HTTP handler.
type Options struct {
	Logger         *slog.Logger
	AllowedOrigins []string
	// Extra registers additional routes on the mux (used by later features and tests).
	Extra func(mux *http.ServeMux)
}

// NewHandler builds the router wrapped in the middleware chain.
// Order, outermost first: request id, access log, CORS, panic recovery.
// Recovery sits inside CORS so 500 responses still carry CORS headers, and
// inside the access log so they are logged with their real status.
func NewHandler(opts Options) http.Handler {
	log := opts.Logger
	if log == nil {
		log = slog.Default()
	}

	mux := http.NewServeMux()
	mux.HandleFunc("GET /health", health)
	if opts.Extra != nil {
		opts.Extra(mux)
	}

	return chain(jsonRouteErrors(mux),
		requestID(),
		accessLog(log),
		cors(opts.AllowedOrigins),
		recoverPanics(log),
	)
}

func health(w http.ResponseWriter, _ *http.Request) {
	WriteJSON(w, http.StatusOK, map[string]string{"status": "ok"})
}

// jsonRouteErrors renders the mux's own 404 and 405 answers as JSON errors,
// keeping the Allow header the mux computes for 405.
func jsonRouteErrors(mux *http.ServeMux) http.Handler {
	return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		h, pattern := mux.Handler(r)
		if pattern != "" {
			h.ServeHTTP(w, r)
			return
		}
		probe := &probeWriter{header: http.Header{}, status: http.StatusNotFound}
		h.ServeHTTP(probe, r)
		if allow := probe.header.Get("Allow"); allow != "" {
			w.Header().Set("Allow", allow)
		}
		WriteError(w, probe.status, http.StatusText(probe.status))
	})
}

// probeWriter captures the status and headers the mux would have written.
type probeWriter struct {
	header http.Header
	status int
}

func (p *probeWriter) Header() http.Header         { return p.header }
func (p *probeWriter) WriteHeader(code int)        { p.status = code }
func (p *probeWriter) Write(b []byte) (int, error) { return len(b), nil }
