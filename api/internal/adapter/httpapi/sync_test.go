package httpapi_test

import (
	"context"
	"encoding/json"
	"errors"
	"net/http"
	"net/http/httptest"
	"strings"
	"testing"
	"time"

	"github.com/John-Santa/fitplan/api/internal/adapter/clerk"
	"github.com/John-Santa/fitplan/api/internal/adapter/httpapi"
	"github.com/John-Santa/fitplan/api/internal/domain/shared"
	domain "github.com/John-Santa/fitplan/api/internal/domain/sync"
	"github.com/John-Santa/fitplan/api/internal/port"
)

// fakeAuth authenticates requests carrying X-Test-User; others get the 401.
type fakeAuth struct{}

func (fakeAuth) Authenticate(next, unauthorized http.Handler) http.Handler {
	return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		id := r.Header.Get("X-Test-User")
		if id == "" {
			unauthorized.ServeHTTP(w, r)
			return
		}
		next.ServeHTTP(w, r.WithContext(port.WithUserID(r.Context(), shared.UserID(id))))
	})
}

type fakeSync struct {
	calls    int
	gotUser  shared.UserID
	gotSince int64
	gotLimit int
	gotPush  domain.ChangeSet
	pull     domain.ChangeSet
	push     domain.PushResult
	err      error
}

func (f *fakeSync) Pull(_ context.Context, userID shared.UserID, since int64, limit int) (domain.ChangeSet, error) {
	f.calls++
	f.gotUser, f.gotSince, f.gotLimit = userID, since, limit
	return f.pull, f.err
}

func (f *fakeSync) Push(_ context.Context, userID shared.UserID, cs domain.ChangeSet) (domain.PushResult, error) {
	f.calls++
	f.gotUser, f.gotPush = userID, cs
	if f.err != nil {
		return domain.PushResult{}, f.err
	}
	if err := cs.Validate(); err != nil {
		return domain.PushResult{}, err
	}
	return f.push, nil
}

func v1Handler(svc *fakeSync) http.Handler {
	return newRouter(httpapi.RouterConfig{Authenticator: fakeAuth{}, Sync: svc})
}

func send(h http.Handler, method, path, body, user string) *httptest.ResponseRecorder {
	req := httptest.NewRequest(method, path, strings.NewReader(body))
	if user != "" {
		req.Header.Set("X-Test-User", user)
	}
	rec := httptest.NewRecorder()
	h.ServeHTTP(rec, req)
	return rec
}

func errorOf(t *testing.T, rec *httptest.ResponseRecorder) string {
	t.Helper()
	return problemOf(t, rec)
}

func TestV1RequiresAuthAndHealthStaysPublic(t *testing.T) {
	svc := &fakeSync{}
	h := v1Handler(svc)
	for _, tc := range []struct{ method, path string }{
		{http.MethodGet, "/v1/me"}, {http.MethodGet, "/v1/sync"}, {http.MethodPost, "/v1/sync"},
	} {
		rec := send(h, tc.method, tc.path, "{}", "")
		if rec.Code != http.StatusUnauthorized || errorOf(t, rec) == "" {
			t.Errorf("%s %s = %d %q, want JSON 401", tc.method, tc.path, rec.Code, rec.Body.String())
		}
	}
	if svc.calls != 0 {
		t.Error("service reached without authentication")
	}
	if rec := send(h, http.MethodGet, "/health", "", ""); rec.Code != http.StatusOK {
		t.Errorf("health = %d, want 200 without auth", rec.Code)
	}
}

func TestMe(t *testing.T) {
	rec := send(v1Handler(&fakeSync{}), http.MethodGet, "/v1/me", "", "user_42")
	if rec.Code != http.StatusOK || rec.Body.String() != "{\"userId\":\"user_42\"}\n" {
		t.Errorf("me = %d %q", rec.Code, rec.Body.String())
	}
}

func TestPullQueryAndWireFormat(t *testing.T) {
	updated := time.UnixMilli(1700000000123).UTC()
	deleted := time.UnixMilli(1700000000999).UTC()
	svc := &fakeSync{pull: domain.ChangeSet{
		Sessions: []domain.Session{{ID: "s1", Body: json.RawMessage(`{"id":"s1"}`), UpdatedAt: updated, DeletedAt: &deleted, Rev: 7}},
		Cursor:   7, HasMore: true,
	}}
	h := v1Handler(svc)
	rec := send(h, http.MethodGet, "/v1/sync?since=5&limit=50", "", "user_a")
	if rec.Code != http.StatusOK {
		t.Fatalf("status = %d %s", rec.Code, rec.Body.String())
	}
	if svc.gotUser != "user_a" || svc.gotSince != 5 || svc.gotLimit != 50 {
		t.Errorf("service got user=%q since=%d limit=%d", svc.gotUser, svc.gotSince, svc.gotLimit)
	}
	want := `{"documents":[],"sessions":[{"id":"s1","body":{"id":"s1"},"updatedAt":1700000000123,"deletedAt":1700000000999,"rev":7}],` +
		`"measurements":[],"exerciseMeta":[],"cursor":7,"hasMore":true}` + "\n"
	if rec.Body.String() != want {
		t.Errorf("body =\n%s\nwant\n%s", rec.Body.String(), want)
	}

	send(h, http.MethodGet, "/v1/sync", "", "user_a")
	if svc.gotSince != 0 || svc.gotLimit != 200 {
		t.Errorf("defaults since=%d limit=%d, want 0/200", svc.gotSince, svc.gotLimit)
	}
}

func TestPullRejectsBadQuery(t *testing.T) {
	svc := &fakeSync{}
	h := v1Handler(svc)
	for _, q := range []string{"since=abc", "since=-1", "limit=0", "limit=501", "limit=x"} {
		rec := send(h, http.MethodGet, "/v1/sync?"+q, "", "user_a")
		if rec.Code != http.StatusBadRequest || errorOf(t, rec) == "" {
			t.Errorf("%s = %d %q, want JSON 400", q, rec.Code, rec.Body.String())
		}
	}
	if svc.calls != 0 {
		t.Error("service called with an invalid query")
	}
}

func TestPushDecodesAndReturnsResults(t *testing.T) {
	svc := &fakeSync{push: domain.PushResult{
		Measurements: []domain.ItemResult{{Key: "2026-11-10", Status: domain.StatusApplied, Rev: 9}},
	}}
	body := `{"measurements":[{"date":"2026-11-10","body":{"weight":80},"updatedAt":1700000000123,"deletedAt":null}]}`
	rec := send(v1Handler(svc), http.MethodPost, "/v1/sync", body, "user_a")
	if rec.Code != http.StatusOK {
		t.Fatalf("status = %d %s", rec.Code, rec.Body.String())
	}
	m := svc.gotPush.Measurements
	if len(m) != 1 || m[0].Date != "2026-11-10" || !m[0].UpdatedAt.Equal(time.UnixMilli(1700000000123)) || m[0].DeletedAt != nil {
		t.Errorf("decoded = %+v", m)
	}
	want := `{"documents":[],"sessions":[],"measurements":[{"key":"2026-11-10","status":"applied","rev":9}],"exerciseMeta":[]}` + "\n"
	if rec.Body.String() != want {
		t.Errorf("body = %s, want %s", rec.Body.String(), want)
	}
}

func TestPushErrors(t *testing.T) {
	big := `{"documents":[{"kind":"plan","body":{"x":"` + strings.Repeat("a", 5<<20) + `"},"updatedAt":1}]}`
	for _, tc := range []struct {
		name, body string
		svcErr     error
		status     int
		msg        string
	}{
		{"invalid json", `{"documents":`, nil, 400, "invalid JSON"},
		{"validation", `{"documents":[{"kind":"habits","body":{},"updatedAt":1}]}`, nil, 400, "documents[0].kind"},
		{"missing updatedAt", `{"documents":[{"kind":"plan","body":{}}]}`, nil, 400, "documents[0].updatedAt"},
		{"unknown field", `{"documents":[],"extra":1}`, nil, 400, "invalid JSON"},
		{"unknown nested field", `{"documents":[{"kind":"plan","body":{},"updatedAt":1,"bogus":true}]}`, nil, 400, "invalid JSON"},
		{"trailing data", `{"documents":[]}{"documents":[]}`, nil, 400, "invalid JSON"},
		{"trailing garbage", `{} x`, nil, 400, "invalid JSON"},
		{"out of range updatedAt", `{"documents":[{"kind":"plan","body":{},"updatedAt":9000000000000000000}]}`, nil, 400, "documents[0].updatedAt"},
		{"too large", big, nil, 413, "too large"},
		{"store failure", `{}`, errors.New("db down"), 500, "internal server error"},
	} {
		t.Run(tc.name, func(t *testing.T) {
			rec := send(v1Handler(&fakeSync{err: tc.svcErr}), http.MethodPost, "/v1/sync", tc.body, "user_a")
			if rec.Code != tc.status {
				t.Fatalf("status = %d, want %d (%s)", rec.Code, tc.status, rec.Body.String())
			}
			if msg := errorOf(t, rec); !strings.Contains(msg, tc.msg) {
				t.Errorf("error = %q, want it to contain %q", msg, tc.msg)
			}
		})
	}
}

func TestUnauthorizedIsProblemWithWWWAuthenticateAndCORS(t *testing.T) {
	for name, cfg := range map[string]httpapi.RouterConfig{
		"clerk":            {Authenticator: clerk.New("sk_test_dummy", nil), Sync: &fakeSync{}},
		"no authenticator": {Sync: &fakeSync{}},
	} {
		h := newRouter(cfg)
		for _, auth := range []string{"", "Basic abc", "Bearer not-a-jwt"} {
			req := httptest.NewRequest(http.MethodGet, "/v1/me", nil)
			req.Header.Set("Origin", allowedOrigin)
			if auth != "" {
				req.Header.Set("Authorization", auth)
			}
			rec := httptest.NewRecorder()
			h.ServeHTTP(rec, req)
			if rec.Code != http.StatusUnauthorized || errorOf(t, rec) != "unauthorized" {
				t.Errorf("%s %q: %d %q, want problem 401", name, auth, rec.Code, rec.Body.String())
			}
			if rec.Header().Get("WWW-Authenticate") == "" {
				t.Errorf("%s %q: missing WWW-Authenticate", name, auth)
			}
			if rec.Header().Get("Access-Control-Allow-Origin") != allowedOrigin {
				t.Errorf("%s %q: 401 must carry CORS headers", name, auth)
			}
		}
	}
}

func TestPreflightToProtectedRouteSkipsAuth(t *testing.T) {
	rec := do(v1Handler(&fakeSync{}), http.MethodOptions, "/v1/sync", map[string]string{
		"Origin": allowedOrigin, "Access-Control-Request-Method": "POST",
	})
	if rec.Code != http.StatusNoContent {
		t.Errorf("preflight = %d, want 204", rec.Code)
	}
}

func TestHeadOnProtectedRouteRequiresAuth(t *testing.T) {
	svc := &fakeSync{}
	rec := send(v1Handler(svc), http.MethodHead, "/v1/me", "", "")
	if rec.Code != http.StatusUnauthorized || svc.calls != 0 {
		t.Errorf("HEAD /v1/me = %d, want 401", rec.Code)
	}
}

func TestV1RoutesUnmountedWithoutSync(t *testing.T) {
	rec := send(newRouter(httpapi.RouterConfig{Authenticator: fakeAuth{}}), http.MethodGet, "/v1/me", "", "")
	if rec.Code != http.StatusNotFound {
		t.Errorf("status = %d, want 404 when no database is configured", rec.Code)
	}
}
