package httpapi_test

import (
	"encoding/json"
	"io"
	"log/slog"
	"net/http"
	"net/http/httptest"
	"strings"
	"testing"

	httpapi "github.com/John-Santa/fitplan/api/internal/http"
)

const allowedOrigin = "https://app.magnifit.co"

func newHandler(extra func(mux *http.ServeMux)) http.Handler {
	return httpapi.NewHandler(httpapi.Options{
		Logger:         slog.New(slog.NewJSONHandler(io.Discard, nil)),
		AllowedOrigins: []string{allowedOrigin},
		Extra:          extra,
	})
}

func do(h http.Handler, method, path string, headers map[string]string) *httptest.ResponseRecorder {
	req := httptest.NewRequest(method, path, nil)
	for k, v := range headers {
		req.Header.Set(k, v)
	}
	rec := httptest.NewRecorder()
	h.ServeHTTP(rec, req)
	return rec
}

func TestHealth(t *testing.T) {
	rec := do(newHandler(nil), http.MethodGet, "/health", nil)
	if rec.Code != http.StatusOK {
		t.Fatalf("status = %d, want 200", rec.Code)
	}
	if ct := rec.Header().Get("Content-Type"); ct != "application/json" {
		t.Errorf("Content-Type = %q", ct)
	}
	if got := rec.Body.String(); got != "{\"status\":\"ok\"}\n" {
		t.Errorf("body = %q", got)
	}
	if rec.Header().Get("X-Request-ID") == "" {
		t.Error("missing X-Request-ID")
	}
}

func TestRequestIDIsPropagated(t *testing.T) {
	rec := do(newHandler(nil), http.MethodGet, "/health", map[string]string{"X-Request-ID": "abc-123"})
	if got := rec.Header().Get("X-Request-ID"); got != "abc-123" {
		t.Errorf("X-Request-ID = %q, want abc-123", got)
	}
}

func TestHealthRejectsOtherMethods(t *testing.T) {
	rec := do(newHandler(nil), http.MethodPost, "/health", nil)
	if rec.Code != http.StatusMethodNotAllowed {
		t.Errorf("status = %d, want 405", rec.Code)
	}
}

func TestNotFoundIsJSON(t *testing.T) {
	rec := do(newHandler(nil), http.MethodGet, "/nope", nil)
	if rec.Code != http.StatusNotFound {
		t.Fatalf("status = %d, want 404", rec.Code)
	}
	var body struct{ Error string }
	if err := json.Unmarshal(rec.Body.Bytes(), &body); err != nil || body.Error == "" {
		t.Errorf("body not a JSON error: %q (%v)", rec.Body.String(), err)
	}
}

func TestCORSAllowedOrigin(t *testing.T) {
	rec := do(newHandler(nil), http.MethodGet, "/health", map[string]string{"Origin": allowedOrigin})
	if got := rec.Header().Get("Access-Control-Allow-Origin"); got != allowedOrigin {
		t.Errorf("Allow-Origin = %q, want %q", got, allowedOrigin)
	}
	if rec.Header().Get("Vary") == "" {
		t.Error("missing Vary: Origin")
	}
}

func TestCORSDeniedOrigin(t *testing.T) {
	rec := do(newHandler(nil), http.MethodGet, "/health", map[string]string{"Origin": "https://evil.example"})
	if got := rec.Header().Get("Access-Control-Allow-Origin"); got != "" {
		t.Errorf("Allow-Origin = %q, want empty", got)
	}
}

func TestCORSPreflightAllowed(t *testing.T) {
	rec := do(newHandler(nil), http.MethodOptions, "/health", map[string]string{
		"Origin":                         allowedOrigin,
		"Access-Control-Request-Method":  "PUT",
		"Access-Control-Request-Headers": "authorization,content-type",
	})
	if rec.Code != http.StatusNoContent {
		t.Fatalf("status = %d, want 204", rec.Code)
	}
	h := rec.Header()
	if h.Get("Access-Control-Allow-Origin") != allowedOrigin {
		t.Errorf("Allow-Origin = %q", h.Get("Access-Control-Allow-Origin"))
	}
	for _, want := range []string{"Authorization", "Content-Type"} {
		if !contains(h.Get("Access-Control-Allow-Headers"), want) {
			t.Errorf("Allow-Headers %q missing %s", h.Get("Access-Control-Allow-Headers"), want)
		}
	}
	for _, want := range []string{"GET", "POST", "PUT", "DELETE", "OPTIONS"} {
		if !contains(h.Get("Access-Control-Allow-Methods"), want) {
			t.Errorf("Allow-Methods %q missing %s", h.Get("Access-Control-Allow-Methods"), want)
		}
	}
}

func TestCORSPreflightDenied(t *testing.T) {
	rec := do(newHandler(nil), http.MethodOptions, "/health", map[string]string{
		"Origin":                        "https://evil.example",
		"Access-Control-Request-Method": "GET",
	})
	if rec.Code != http.StatusForbidden {
		t.Errorf("status = %d, want 403", rec.Code)
	}
	if rec.Header().Get("Access-Control-Allow-Origin") != "" {
		t.Error("denied preflight must not carry Allow-Origin")
	}
}

func TestRecoverReturnsJSON500(t *testing.T) {
	h := newHandler(func(mux *http.ServeMux) {
		mux.HandleFunc("GET /boom", func(http.ResponseWriter, *http.Request) { panic("kaboom") })
	})
	rec := do(h, http.MethodGet, "/boom", map[string]string{"Origin": allowedOrigin})
	if rec.Code != http.StatusInternalServerError {
		t.Fatalf("status = %d, want 500", rec.Code)
	}
	var body struct{ Error string }
	if err := json.Unmarshal(rec.Body.Bytes(), &body); err != nil || body.Error == "" {
		t.Errorf("body not a JSON error: %q (%v)", rec.Body.String(), err)
	}
	if rec.Body.String() != "" && contains(rec.Body.String(), "kaboom") {
		t.Error("panic value must not leak to the client")
	}
	if rec.Header().Get("Access-Control-Allow-Origin") != allowedOrigin {
		t.Error("500 responses must still carry CORS headers")
	}
}

func contains(s, sub string) bool { return strings.Contains(s, sub) }
