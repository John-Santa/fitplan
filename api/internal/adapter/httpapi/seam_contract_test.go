package httpapi_test

import (
	"net/http"
	"net/http/httptest"
	"strings"
	"testing"
	"time"

	"github.com/John-Santa/fitplan/api/internal/adapter/httpapi"
)

// The deadline answer (504) of the sync routes is part of the contract.
func TestDeadlineResponseMatchesTheContract(t *testing.T) {
	v := contractValidator(t)
	h := newRouter(httpapi.RouterConfig{
		Authenticator: fakeAuth{},
		Sync:          blockingSync{},
		Timeout:       20 * time.Millisecond,
	})
	for name, tc := range map[string]struct{ method, body string }{
		"pull": {http.MethodGet, ""},
		"push": {http.MethodPost, `{"documents":[]}`},
	} {
		t.Run(name, func(t *testing.T) {
			req := httptest.NewRequest(tc.method, "/v1/sync", strings.NewReader(tc.body))
			req.Header.Set("X-Test-User", "user_a")
			if tc.body != "" {
				req.Header.Set("Content-Type", "application/json")
			}
			rec := httptest.NewRecorder()
			h.ServeHTTP(rec, req)
			if rec.Code != http.StatusGatewayTimeout {
				t.Fatalf("status = %d, want 504", rec.Code)
			}
			resp := rec.Result()
			defer func() { _ = resp.Body.Close() }()
			if ok, errs := v.ValidateHttpResponse(req, resp); !ok {
				t.Errorf("504 does not match the contract: %s", describe(errs))
			}
		})
	}
}

// The per-user limit covers every /v1 route, the account deletions included.
func TestRateLimitedDeleteRoutesMatchTheContract(t *testing.T) {
	v := contractValidator(t)
	for _, path := range []string{"/v1/me", "/v1/data"} {
		t.Run(path, func(t *testing.T) {
			h := newRouter(httpapi.RouterConfig{
				Authenticator: fakeAuth{},
				Sync:          &fakeSync{},
				Account:       &fakeAccount{},
				RateLimit:     httpapi.RateLimitConfig{RPS: 1, Burst: 1, Now: func() time.Time { return time.Unix(1_700_000_000, 0) }},
			})
			var rec *httptest.ResponseRecorder
			var req *http.Request
			for i := 0; i < 2; i++ {
				req = httptest.NewRequest(http.MethodDelete, path, nil)
				req.Header.Set("X-Test-User", "user_a")
				rec = httptest.NewRecorder()
				h.ServeHTTP(rec, req)
			}
			if rec.Code != http.StatusTooManyRequests {
				t.Fatalf("second DELETE %s: status = %d, want 429", path, rec.Code)
			}
			resp := rec.Result()
			defer func() { _ = resp.Body.Close() }()
			if ok, errs := v.ValidateHttpResponse(req, resp); !ok {
				t.Errorf("429 on DELETE %s does not match the contract: %s", path, describe(errs))
			}
		})
	}
}
