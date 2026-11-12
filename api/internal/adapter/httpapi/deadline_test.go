package httpapi_test

import (
	"bytes"
	"context"
	"errors"
	"fmt"
	"log"
	"net/http"
	"net/http/httptest"
	"strings"
	"sync"
	"testing"
	"time"

	"github.com/John-Santa/fitplan/api/internal/adapter/httpapi"
	"github.com/John-Santa/fitplan/api/internal/domain/shared"
	domain "github.com/John-Santa/fitplan/api/internal/domain/sync"
)

// blockingSync waits for the request context to end and returns its error,
// like a database call cancelled by the handler deadline.
type blockingSync struct{}

func (blockingSync) Pull(ctx context.Context, _ shared.UserID, _ int64, _ int) (domain.ChangeSet, error) {
	<-ctx.Done()
	return domain.ChangeSet{}, fmt.Errorf("pull: %w", ctx.Err())
}

func (blockingSync) Push(ctx context.Context, _ shared.UserID, _ domain.ChangeSet) (domain.PushResult, error) {
	<-ctx.Done()
	return domain.PushResult{}, fmt.Errorf("push: %w", ctx.Err())
}

type lockedBuffer struct {
	mu sync.Mutex
	b  bytes.Buffer
}

func (l *lockedBuffer) Write(p []byte) (int, error) {
	l.mu.Lock()
	defer l.mu.Unlock()
	return l.b.Write(p)
}

func (l *lockedBuffer) String() string {
	l.mu.Lock()
	defer l.mu.Unlock()
	return l.b.String()
}

func TestDeadlineExceededAnswers504WithoutSuperfluousWriteHeader(t *testing.T) {
	h := newRouter(httpapi.RouterConfig{
		Authenticator: fakeAuth{},
		Sync:          blockingSync{},
		Timeout:       20 * time.Millisecond,
	})
	serverLog := &lockedBuffer{}
	srv := httptest.NewUnstartedServer(h)
	srv.Config.ErrorLog = log.New(serverLog, "", 0)
	srv.Start()
	defer srv.Close()

	for name, tc := range map[string]struct{ method, path, body string }{
		"pull": {http.MethodGet, "/v1/sync", ""},
		"push": {http.MethodPost, "/v1/sync", `{"documents":[]}`},
	} {
		t.Run(name, func(t *testing.T) {
			req, err := http.NewRequest(tc.method, srv.URL+tc.path, strings.NewReader(tc.body))
			if err != nil {
				t.Fatal(err)
			}
			req.Header.Set("X-Test-User", "user_a")
			resp, err := http.DefaultClient.Do(req)
			if err != nil {
				t.Fatal(err)
			}
			defer func() { _ = resp.Body.Close() }()

			if resp.StatusCode != http.StatusGatewayTimeout {
				t.Fatalf("status = %d, want 504", resp.StatusCode)
			}
			if ct := resp.Header.Get("Content-Type"); ct != httpapi.ProblemContentType {
				t.Errorf("Content-Type = %q, want %q", ct, httpapi.ProblemContentType)
			}
			if got := resp.Header.Get("Cache-Control"); got != "no-store" {
				t.Errorf("Cache-Control = %q, want the security headers kept", got)
			}
			var buf bytes.Buffer
			_, _ = buf.ReadFrom(resp.Body)
			body := buf.String()
			want := `"title":"Gateway Timeout","status":504,"detail":"gateway timeout"`
			if !strings.Contains(body, want) {
				t.Errorf("body = %q, want it to contain %q", body, want)
			}
			if strings.Contains(body, "context") || strings.Contains(body, "deadline") {
				t.Errorf("body leaks the internal error: %q", body)
			}
		})
	}
	if out := serverLog.String(); strings.Contains(out, "superfluous") {
		t.Errorf("server log has a superfluous WriteHeader line: %q", out)
	}
}

func TestOtherStoreErrorsStillAnswerOpaque500(t *testing.T) {
	for name, err := range map[string]error{
		"plain":         errors.New("db down"),
		"canceled":      context.Canceled,
		"wrapped plain": fmt.Errorf("pull: %w", errors.New("conn reset")),
	} {
		t.Run(name, func(t *testing.T) {
			rec := send(v1Handler(&fakeSync{err: err}), http.MethodGet, "/v1/sync", "", "user_a")
			if rec.Code != http.StatusInternalServerError {
				t.Fatalf("status = %d, want 500", rec.Code)
			}
			if got := errorOf(t, rec); got != "internal server error" {
				t.Errorf("detail = %q, want the opaque message", got)
			}
		})
	}
}
