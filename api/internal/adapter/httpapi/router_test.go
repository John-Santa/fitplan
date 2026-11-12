package httpapi_test

import (
	"context"
	"encoding/json"
	"errors"
	"io"
	"log/slog"
	"net/http"
	"net/http/httptest"
	"strings"
	"testing"

	"github.com/go-chi/chi/v5"

	"github.com/John-Santa/fitplan/api/internal/adapter/httpapi"
)

const allowedOrigin = "https://app.magnifit.co"

func newHandler(extra func(r chi.Router)) http.Handler {
	return newRouter(httpapi.RouterConfig{Extra: extra})
}

func newRouter(cfg httpapi.RouterConfig) http.Handler {
	cfg.Logger = slog.New(slog.NewJSONHandler(io.Discard, nil))
	cfg.AllowedOrigins = []string{allowedOrigin}
	return httpapi.NewRouter(cfg)
}

// problemOf asserts a problem+json body and returns its detail.
func problemOf(t *testing.T, rec *httptest.ResponseRecorder) string {
	t.Helper()
	if ct := rec.Header().Get("Content-Type"); ct != httpapi.ProblemContentType {
		t.Errorf("Content-Type = %q, want %q", ct, httpapi.ProblemContentType)
	}
	var p httpapi.Problem
	if err := json.Unmarshal(rec.Body.Bytes(), &p); err != nil {
		t.Fatalf("body is not JSON: %q", rec.Body.String())
	}
	if p.Type != "about:blank" || p.Status != rec.Code || p.Title != http.StatusText(rec.Code) {
		t.Errorf("problem = %+v, want about:blank / %d / %q", p, rec.Code, http.StatusText(rec.Code))
	}
	return p.Detail
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
	if got := rec.Header().Get("Allow"); got != "GET, HEAD" {
		t.Errorf("Allow = %q, want GET, HEAD", got)
	}
	if problemOf(t, rec) == "" {
		t.Error("405 problem without detail")
	}
}

func TestNotFoundIsJSON(t *testing.T) {
	rec := do(newHandler(nil), http.MethodGet, "/nope", nil)
	if rec.Code != http.StatusNotFound {
		t.Fatalf("status = %d, want 404", rec.Code)
	}
	if problemOf(t, rec) == "" {
		t.Errorf("404 problem without detail: %q", rec.Body.String())
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
	if got := problemOf(t, rec); got != "origin not allowed" {
		t.Errorf("detail = %q", got)
	}
	if rec.Header().Get("Access-Control-Allow-Origin") != "" {
		t.Error("denied preflight must not carry Allow-Origin")
	}
}

func TestRecoverReturnsJSON500(t *testing.T) {
	h := newRouter(httpapi.RouterConfig{Authenticator: fakeAuth{}, Extra: func(r chi.Router) {
		r.Get("/boom", func(http.ResponseWriter, *http.Request) { panic("kaboom") })
	}})
	rec := do(h, http.MethodGet, "/boom", map[string]string{"Origin": allowedOrigin, "X-Test-User": "user_a"})
	if rec.Code != http.StatusInternalServerError {
		t.Fatalf("status = %d, want 500", rec.Code)
	}
	if problemOf(t, rec) != "internal server error" {
		t.Errorf("body = %q, want detail internal server error", rec.Body.String())
	}
	if rec.Body.String() != "" && contains(rec.Body.String(), "kaboom") {
		t.Error("panic value must not leak to the client")
	}
	if rec.Header().Get("Access-Control-Allow-Origin") != allowedOrigin {
		t.Error("500 responses must still carry CORS headers")
	}
}

func contains(s, sub string) bool { return strings.Contains(s, sub) }

func TestHeadHealthIsServed(t *testing.T) {
	rec := do(newHandler(nil), http.MethodHead, "/health", nil)
	if rec.Code != http.StatusOK {
		t.Errorf("HEAD /health = %d, want 200", rec.Code)
	}
}

type pinger struct{ err error }

func (p pinger) Ping(context.Context) error { return p.err }

func TestReadyz(t *testing.T) {
	rec := do(newRouter(httpapi.RouterConfig{Readiness: pinger{}}), http.MethodGet, "/readyz", nil)
	if rec.Code != http.StatusOK || rec.Body.String() != "{\"status\":\"ready\"}\n" {
		t.Errorf("ready = %d %q", rec.Code, rec.Body.String())
	}
	for name, cfg := range map[string]httpapi.RouterConfig{
		"db down":        {Readiness: pinger{err: errors.New("connection refused")}},
		"not configured": {},
	} {
		rec := do(newRouter(cfg), http.MethodGet, "/readyz", nil)
		if rec.Code != http.StatusServiceUnavailable {
			t.Errorf("%s: status = %d, want 503", name, rec.Code)
		}
		if d := problemOf(t, rec); d == "" || contains(d, "connection refused") {
			t.Errorf("%s: detail = %q (must be set and not leak the cause)", name, d)
		}
	}
}
