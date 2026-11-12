package clerk_test

import (
	"net/http"
	"net/http/httptest"
	"testing"

	"github.com/John-Santa/fitplan/api/internal/adapter/clerk"
)

func TestClerkRejectsMissingOrMalformedTokenThroughUnauthorizedHandler(t *testing.T) {
	a := clerk.New("sk_test_dummy", nil)
	unauthorized := http.HandlerFunc(func(w http.ResponseWriter, _ *http.Request) {
		w.WriteHeader(http.StatusUnauthorized)
	})
	for name, header := range map[string]string{
		"no header":       "",
		"not bearer":      "Basic abc",
		"malformed token": "Bearer not-a-jwt",
	} {
		t.Run(name, func(t *testing.T) {
			reached := false
			h := a.Authenticate(http.HandlerFunc(func(http.ResponseWriter, *http.Request) { reached = true }), unauthorized)
			req := httptest.NewRequest(http.MethodGet, "/v1/me", nil)
			if header != "" {
				req.Header.Set("Authorization", header)
			}
			rec := httptest.NewRecorder()
			h.ServeHTTP(rec, req)
			if reached {
				t.Fatal("handler must not be reached without a valid token")
			}
			if rec.Code != http.StatusUnauthorized {
				t.Errorf("status = %d, want 401", rec.Code)
			}
		})
	}
}
