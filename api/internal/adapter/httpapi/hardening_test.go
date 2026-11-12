package httpapi_test

import (
	"net/http"
	"testing"

	"github.com/go-chi/chi/v5"

	"github.com/John-Santa/fitplan/api/internal/adapter/httpapi"
)

func TestSecurityHeadersOnEveryResponse(t *testing.T) {
	want := map[string]string{
		"X-Content-Type-Options":    "nosniff",
		"Strict-Transport-Security": "max-age=31536000; includeSubDomains",
		"Content-Security-Policy":   "default-src 'none'; frame-ancestors 'none'",
		"Referrer-Policy":           "no-referrer",
		"Cache-Control":             "no-store",
	}
	for name, path := range map[string]string{"success": "/health", "problem": "/missing"} {
		t.Run(name, func(t *testing.T) {
			rec := do(newHandler(nil), http.MethodGet, path, nil)
			for header, value := range want {
				if got := rec.Header().Get(header); got != value {
					t.Errorf("%s = %q, want %q", header, got, value)
				}
			}
		})
	}
}

func TestRequestIDKeepsSafeIncomingValue(t *testing.T) {
	rec := do(newHandler(nil), http.MethodGet, "/health", map[string]string{"X-Request-ID": "abc-123_DEF.4"})
	if got := rec.Header().Get("X-Request-ID"); got != "abc-123_DEF.4" {
		t.Errorf("X-Request-ID = %q, want the incoming value", got)
	}
}

func TestRequestIDReplacesUnsafeIncomingValue(t *testing.T) {
	for name, incoming := range map[string]string{
		"spaces":  "abc def",
		"markup":  "<script>",
		"unicode": "idé",
	} {
		t.Run(name, func(t *testing.T) {
			rec := do(newHandler(nil), http.MethodGet, "/health", map[string]string{"X-Request-ID": incoming})
			got := rec.Header().Get("X-Request-ID")
			if got == "" || got == incoming {
				t.Errorf("X-Request-ID = %q, want a generated id", got)
			}
		})
	}
}

func TestHandlersRunWithADeadline(t *testing.T) {
	hasDeadline := false
	h := newRouter(httpapi.RouterConfig{Authenticator: fakeAuth{}, Extra: func(r chi.Router) {
		r.Get("/deadline", func(w http.ResponseWriter, req *http.Request) {
			_, hasDeadline = req.Context().Deadline()
			w.WriteHeader(http.StatusNoContent)
		})
	}})
	do(h, http.MethodGet, "/deadline", map[string]string{"X-Test-User": "user_a"})
	if !hasDeadline {
		t.Error("handler context has no deadline")
	}
}
