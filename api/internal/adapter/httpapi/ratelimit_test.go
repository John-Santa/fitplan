package httpapi_test

import (
	"context"
	"net/http"
	"net/http/httptest"
	"strconv"
	"strings"
	"sync"
	"testing"
	"time"

	"github.com/John-Santa/fitplan/api/internal/adapter/httpapi"
)

// clock is a settable time source for the limiter.
type clock struct {
	mu sync.Mutex
	t  time.Time
}

func (c *clock) now() time.Time {
	c.mu.Lock()
	defer c.mu.Unlock()
	return c.t
}

func (c *clock) advance(d time.Duration) {
	c.mu.Lock()
	defer c.mu.Unlock()
	c.t = c.t.Add(d)
}

type okPinger struct{}

func (okPinger) Ping(_ context.Context) error { return nil }

func limited(rps float64, burst int, svc *fakeSync) (http.Handler, *clock) {
	clk := &clock{t: time.Unix(1_700_000_000, 0)}
	h := newRouter(httpapi.RouterConfig{
		Authenticator: fakeAuth{},
		Sync:          svc,
		Readiness:     okPinger{},
		RateLimit:     httpapi.RateLimitConfig{RPS: rps, Burst: burst, Now: clk.now},
	})
	return h, clk
}

func getMe(h http.Handler, user string, headers map[string]string) *httptest.ResponseRecorder {
	all := map[string]string{"X-Test-User": user}
	for k, v := range headers {
		all[k] = v
	}
	return do(h, http.MethodGet, "/v1/me", all)
}

func TestRateLimitAnswers429AfterTheBurst(t *testing.T) {
	h, _ := limited(1, 3, &fakeSync{})
	for i := 0; i < 3; i++ {
		if rec := getMe(h, "user_a", nil); rec.Code != http.StatusOK {
			t.Fatalf("request %d: status = %d, want 200", i+1, rec.Code)
		}
	}
	rec := getMe(h, "user_a", map[string]string{"Origin": allowedOrigin})
	if rec.Code != http.StatusTooManyRequests {
		t.Fatalf("status = %d, want 429", rec.Code)
	}
	if detail := problemOf(t, rec); detail != "too many requests" {
		t.Errorf("detail = %q, want the opaque \"too many requests\"", detail)
	}
	if got := rec.Header().Get("Retry-After"); got != "1" {
		t.Errorf("Retry-After = %q, want 1", got)
	}
	if got := rec.Header().Get("Cache-Control"); got != "no-store" {
		t.Errorf("Cache-Control = %q: security headers must be on the 429", got)
	}
	if got := rec.Header().Get("X-Request-ID"); got == "" {
		t.Error("429 carries no X-Request-ID")
	}
	if got := rec.Header().Get("Access-Control-Allow-Origin"); got != allowedOrigin {
		t.Errorf("Access-Control-Allow-Origin = %q: the browser could not read the 429", got)
	}
	if got := rec.Header().Get("Access-Control-Expose-Headers"); !strings.Contains(got, "Retry-After") {
		t.Errorf("Access-Control-Expose-Headers = %q: a cross-origin page could not read Retry-After", got)
	}
	if strings.Contains(rec.Body.String(), "user_a") {
		t.Errorf("429 body leaks the user id: %s", rec.Body.String())
	}
}

func TestRateLimitRetryAfterRoundsUpToWholeSeconds(t *testing.T) {
	for _, tc := range []struct {
		rps  float64
		want string
	}{{1, "1"}, {0.1, "10"}, {0.4, "3"}, {100, "1"}} {
		h, _ := limited(tc.rps, 1, &fakeSync{})
		getMe(h, "user_a", nil)
		rec := getMe(h, "user_a", nil)
		if rec.Code != http.StatusTooManyRequests {
			t.Fatalf("rps %v: status = %d, want 429", tc.rps, rec.Code)
		}
		if got := rec.Header().Get("Retry-After"); got != tc.want {
			t.Errorf("rps %v: Retry-After = %q, want %q", tc.rps, got, tc.want)
		}
	}
}

func TestRateLimitIsPerUser(t *testing.T) {
	h, _ := limited(1, 1, &fakeSync{})
	getMe(h, "user_a", nil)
	if rec := getMe(h, "user_a", nil); rec.Code != http.StatusTooManyRequests {
		t.Fatalf("user_a second request: status = %d, want 429", rec.Code)
	}
	if rec := getMe(h, "user_b", nil); rec.Code != http.StatusOK {
		t.Errorf("user_b: status = %d, want 200 (a neighbour's limit must not apply)", rec.Code)
	}
}

func TestRateLimitRefillsOverTime(t *testing.T) {
	h, clk := limited(2, 1, &fakeSync{})
	getMe(h, "user_a", nil)
	if rec := getMe(h, "user_a", nil); rec.Code != http.StatusTooManyRequests {
		t.Fatalf("status = %d, want 429", rec.Code)
	}
	clk.advance(600 * time.Millisecond)
	if rec := getMe(h, "user_a", nil); rec.Code != http.StatusOK {
		t.Errorf("after refill: status = %d, want 200", rec.Code)
	}
}

func TestRateLimitSkipsProbes(t *testing.T) {
	h, _ := limited(1, 1, &fakeSync{})
	for _, path := range []string{"/health", "/readyz"} {
		for i := 0; i < 5; i++ {
			if rec := do(h, http.MethodGet, path, nil); rec.Code != http.StatusOK {
				t.Fatalf("%s request %d: status = %d, want 200", path, i+1, rec.Code)
			}
		}
	}
}

func TestRateLimitComesAfterAuth(t *testing.T) {
	h, _ := limited(1, 1, &fakeSync{})
	for i := 0; i < 5; i++ {
		if rec := do(h, http.MethodGet, "/v1/me", nil); rec.Code != http.StatusUnauthorized {
			t.Fatalf("anonymous request %d: status = %d, want 401", i+1, rec.Code)
		}
	}
	if rec := getMe(h, "user_a", nil); rec.Code != http.StatusOK {
		t.Errorf("user_a: status = %d, want 200", rec.Code)
	}
}

func TestRateLimitedRequestNeverReachesTheService(t *testing.T) {
	svc := &fakeSync{}
	h, _ := limited(1, 1, svc)
	send(h, http.MethodGet, "/v1/sync", "", "user_a")
	before := svc.calls
	rec := send(h, http.MethodPost, "/v1/sync", `{}`, "user_a")
	if rec.Code != http.StatusTooManyRequests {
		t.Fatalf("status = %d, want 429", rec.Code)
	}
	if svc.calls != before {
		t.Error("a throttled push reached the sync service")
	}
}

func TestSyncAndMeBehaveTheSameUnderTheLimit(t *testing.T) {
	h, _ := limited(10, 10, &fakeSync{})
	me := getMe(h, "user_a", nil)
	if me.Code != http.StatusOK || me.Body.String() != "{\"userId\":\"user_a\"}\n" {
		t.Errorf("/v1/me = %d %q", me.Code, me.Body.String())
	}
	pull := send(h, http.MethodGet, "/v1/sync?since=0", "", "user_a")
	if pull.Code != http.StatusOK || pull.Header().Get("Retry-After") != "" {
		t.Errorf("pull = %d, Retry-After %q", pull.Code, pull.Header().Get("Retry-After"))
	}
	push := send(h, http.MethodPost, "/v1/sync", `{}`, "user_a")
	if push.Code != http.StatusOK {
		t.Errorf("push = %d, want 200", push.Code)
	}
}

func TestRateLimitDefaultsApplyWhenUnconfigured(t *testing.T) {
	// Frozen clock: with the real one, a slow run refills a token between the
	// burst and the extra request and the 429 never comes.
	clk := &clock{t: time.Unix(1_700_000_000, 0)}
	h := newRouter(httpapi.RouterConfig{
		Authenticator: fakeAuth{},
		Sync:          &fakeSync{},
		RateLimit:     httpapi.RateLimitConfig{Now: clk.now},
	})
	for i := 0; i < httpapi.DefaultRateLimitBurst; i++ {
		if rec := getMe(h, "user_a", nil); rec.Code != http.StatusOK {
			t.Fatalf("request %d: status = %d, want 200 within the default burst", i+1, rec.Code)
		}
	}
	if rec := getMe(h, "user_a", nil); rec.Code != http.StatusTooManyRequests {
		t.Errorf("status = %d, want 429 beyond the default burst", rec.Code)
	}
}

func TestRateLimitIsRaceFree(t *testing.T) {
	h, _ := limited(1, 50, &fakeSync{})
	var wg sync.WaitGroup
	var mu sync.Mutex
	ok := 0
	for g := 0; g < 20; g++ {
		wg.Add(1)
		go func() {
			defer wg.Done()
			for i := 0; i < 20; i++ {
				rec := getMe(h, "user_"+strconv.Itoa(g%2), nil)
				if rec.Code == http.StatusOK {
					mu.Lock()
					ok++
					mu.Unlock()
				}
			}
		}()
	}
	wg.Wait()
	// Two users with a burst of 50 and a frozen clock: exactly 100 pass.
	if ok != 100 {
		t.Errorf("%d requests passed, want exactly 100 (burst 50 for each of 2 users)", ok)
	}
}
