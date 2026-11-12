package auth_test

import (
	"context"
	"encoding/json"
	"net/http"
	"net/http/httptest"
	"testing"

	"github.com/John-Santa/fitplan/api/internal/auth"
)

func TestUserIDRoundTrip(t *testing.T) {
	if _, ok := auth.UserID(context.Background()); ok {
		t.Error("empty context must have no user")
	}
	id, ok := auth.UserID(auth.WithUserID(context.Background(), "user_1"))
	if !ok || id != "user_1" {
		t.Errorf("UserID = %q/%v", id, ok)
	}
	if _, ok := auth.UserID(auth.WithUserID(context.Background(), "")); ok {
		t.Error("empty id must not count as authenticated")
	}
}

func TestClerkRejectsMissingOrMalformedTokenWithJSON401(t *testing.T) {
	mw := auth.NewClerk("sk_test_dummy", nil)
	for name, header := range map[string]string{
		"no header":       "",
		"not bearer":      "Basic abc",
		"malformed token": "Bearer not-a-jwt",
	} {
		t.Run(name, func(t *testing.T) {
			reached := false
			h := mw(http.HandlerFunc(func(http.ResponseWriter, *http.Request) { reached = true }))
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
			if ct := rec.Header().Get("Content-Type"); ct != "application/json" {
				t.Errorf("Content-Type = %q", ct)
			}
			var body struct{ Error string }
			if err := json.Unmarshal(rec.Body.Bytes(), &body); err != nil || body.Error == "" {
				t.Errorf("body = %q (%v)", rec.Body.String(), err)
			}
			if rec.Header().Get("WWW-Authenticate") == "" {
				t.Error("missing WWW-Authenticate header")
			}
		})
	}
}
