package httpapi

import (
	"net/http"
	"strconv"
	"strings"
	"sync"
	"time"

	"golang.org/x/time/rate"

	"github.com/John-Santa/fitplan/api/internal/port"
)

// Defaults for the per-user rate limit. The sync client sends a few requests
// per second at most (a 3 s debounce, then pages of 200 records), so a
// first-login upload of a long history fits in the burst and the rest waits
// out a Retry-After.
const (
	DefaultRateLimitRPS   = 10.0
	DefaultRateLimitBurst = 60
	defaultLimiterTTL     = 10 * time.Minute
	defaultLimiterMaxKeys = 10_000
	// sweepEvery bounds how often idle entries are scanned for.
	sweepEvery = time.Minute
)

// RateLimitConfig tunes the per-user token bucket. Zero fields take their
// defaults, so an unconfigured router is still protected.
type RateLimitConfig struct {
	// RPS is the sustained rate, in requests per second per user.
	RPS float64
	// Burst is the bucket size: how many requests a user may send at once.
	Burst int
	// TTL is how long an idle user's limiter is kept (never less than the
	// time the bucket needs to refill, so evicting it loses nothing).
	TTL time.Duration
	// MaxKeys caps the number of limiters held in memory.
	MaxKeys int
	// Now is the time source; nil means time.Now (tests only).
	Now func() time.Time
}

func (c RateLimitConfig) withDefaults() RateLimitConfig {
	if c.RPS <= 0 {
		c.RPS = DefaultRateLimitRPS
	}
	if c.Burst <= 0 {
		c.Burst = DefaultRateLimitBurst
	}
	if c.TTL <= 0 {
		c.TTL = defaultLimiterTTL
	}
	if c.MaxKeys <= 0 {
		c.MaxKeys = defaultLimiterMaxKeys
	}
	if c.Now == nil {
		c.Now = time.Now
	}
	return c
}

type limiterEntry struct {
	lim      *rate.Limiter
	lastSeen time.Time
}

// limiterStore holds one token bucket per user id. Memory is bounded: idle
// entries are swept on a timer driven by the requests themselves (no
// goroutine), and the map never grows past maxKeys.
type limiterStore struct {
	mu        sync.Mutex
	entries   map[string]*limiterEntry
	rps       rate.Limit
	burst     int
	ttl       time.Duration
	maxKeys   int
	now       func() time.Time
	lastSweep time.Time
}

func newLimiterStore(cfg RateLimitConfig, now func() time.Time) *limiterStore {
	cfg = cfg.withDefaults()
	// An entry idle for less than its refill time still holds a debt; dropping
	// it would hand the user a full bucket early.
	refill := time.Duration(float64(cfg.Burst) / cfg.RPS * float64(time.Second))
	return &limiterStore{
		entries: make(map[string]*limiterEntry),
		rps:     rate.Limit(cfg.RPS),
		burst:   cfg.Burst,
		ttl:     max(cfg.TTL, refill+time.Second),
		maxKeys: cfg.MaxKeys,
		now:     now,
	}
}

// limiterFor returns the user's limiter, creating it (and making room) when new.
func (s *limiterStore) limiterFor(id string) *rate.Limiter {
	s.mu.Lock()
	defer s.mu.Unlock()
	now := s.now()
	if now.Sub(s.lastSweep) >= sweepEvery {
		s.sweep(now)
	}
	if e, ok := s.entries[id]; ok {
		e.lastSeen = now
		return e.lim
	}
	if len(s.entries) >= s.maxKeys {
		s.sweep(now)
		if len(s.entries) >= s.maxKeys {
			s.evictOldest()
		}
	}
	e := &limiterEntry{lim: rate.NewLimiter(s.rps, s.burst), lastSeen: now}
	s.entries[id] = e
	return e.lim
}

func (s *limiterStore) sweep(now time.Time) {
	s.lastSweep = now
	for id, e := range s.entries {
		if now.Sub(e.lastSeen) > s.ttl {
			delete(s.entries, id)
		}
	}
}

func (s *limiterStore) evictOldest() {
	var oldest string
	var oldestSeen time.Time
	first := true
	for id, e := range s.entries {
		if first || e.lastSeen.Before(oldestSeen) {
			oldest, oldestSeen, first = id, e.lastSeen, false
		}
	}
	if !first {
		delete(s.entries, oldest)
	}
}

func (s *limiterStore) size() int {
	s.mu.Lock()
	defer s.mu.Unlock()
	return len(s.entries)
}

func (s *limiterStore) has(id string) bool {
	s.mu.Lock()
	defer s.mu.Unlock()
	_, ok := s.entries[id]
	return ok
}

// rateLimit throttles /v1/* per authenticated user id (the verified JWT sub).
// It must sit after authentication: anonymous requests carry no user and pass
// through to be rejected (or not routed) as before, and the probes outside
// /v1 are never limited. A throttled request answers 429 with Retry-After and
// never reaches a handler.
func rateLimit(cfg RateLimitConfig) func(http.Handler) http.Handler {
	cfg = cfg.withDefaults()
	store := newLimiterStore(cfg, cfg.Now)
	return func(next http.Handler) http.Handler {
		return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
			if !strings.HasPrefix(r.URL.Path, "/v1/") {
				next.ServeHTTP(w, r)
				return
			}
			id, ok := port.UserIDFrom(r.Context())
			if !ok {
				next.ServeHTTP(w, r)
				return
			}
			now := cfg.Now()
			res := store.limiterFor(string(id)).ReserveN(now, 1)
			if !res.OK() {
				writeTooManyRequests(w, time.Second)
				return
			}
			if delay := res.DelayFrom(now); delay > 0 {
				res.CancelAt(now)
				writeTooManyRequests(w, delay)
				return
			}
			next.ServeHTTP(w, r)
		})
	}
}

// writeTooManyRequests answers 429; Retry-After is the wait rounded up to a
// whole second (at least 1). The body is the same opaque problem as any error.
func writeTooManyRequests(w http.ResponseWriter, wait time.Duration) {
	secs := int((wait + time.Second - 1) / time.Second)
	w.Header().Set("Retry-After", strconv.Itoa(max(secs, 1)))
	WriteProblem(w, http.StatusTooManyRequests, "too many requests")
}
