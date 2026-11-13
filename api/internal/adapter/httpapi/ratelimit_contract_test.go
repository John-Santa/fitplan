package httpapi_test

import (
	"net/http"
	"net/http/httptest"
	"testing"
)

func TestRateLimitResponseMatchesTheContract(t *testing.T) {
	v := contractValidator(t)
	h, _ := limited(1, 1, &fakeSync{})
	getMe(h, "user_a", nil)
	req := httptest.NewRequest(http.MethodGet, "/v1/me", nil)
	req.Header.Set("X-Test-User", "user_a")
	rec := httptest.NewRecorder()
	h.ServeHTTP(rec, req)
	if rec.Code != http.StatusTooManyRequests {
		t.Fatalf("status = %d, want 429", rec.Code)
	}
	resp := rec.Result()
	defer func() { _ = resp.Body.Close() }()
	if ok, errs := v.ValidateHttpResponse(req, resp); !ok {
		t.Errorf("429 does not match the contract: %s", describe(errs))
	}
}
