package httpapi

import (
	"strconv"
	"testing"
	"time"
)

func TestLimiterStoreEvictsIdleEntries(t *testing.T) {
	now := time.Unix(1_700_000_000, 0)
	s := newLimiterStore(RateLimitConfig{RPS: 1, Burst: 1, TTL: time.Minute, MaxKeys: 100}, func() time.Time { return now })
	for i := 0; i < 10; i++ {
		s.limiterFor("user_" + strconv.Itoa(i))
	}
	if got := s.size(); got != 10 {
		t.Fatalf("size = %d, want 10", got)
	}
	now = now.Add(2 * time.Minute)
	s.limiterFor("user_new")
	if got := s.size(); got != 1 {
		t.Errorf("size after the idle TTL = %d, want 1 (only the fresh entry)", got)
	}
}

func TestLimiterStoreNeverExceedsMaxKeys(t *testing.T) {
	now := time.Unix(1_700_000_000, 0)
	s := newLimiterStore(RateLimitConfig{RPS: 1, Burst: 1, TTL: time.Hour, MaxKeys: 5}, func() time.Time { return now })
	for i := 0; i < 50; i++ {
		now = now.Add(time.Second)
		s.limiterFor("user_" + strconv.Itoa(i))
		if got := s.size(); got > 5 {
			t.Fatalf("size = %d after %d users, want at most 5", got, i+1)
		}
	}
	// The most recent users survive; the least recently seen were evicted.
	if !s.has("user_49") || s.has("user_0") {
		t.Errorf("eviction kept the wrong entries (user_49 %v, user_0 %v)", s.has("user_49"), s.has("user_0"))
	}
}

func TestLimiterStoreKeepsActiveEntriesAcrossSweeps(t *testing.T) {
	now := time.Unix(1_700_000_000, 0)
	s := newLimiterStore(RateLimitConfig{RPS: 1, Burst: 1, TTL: time.Minute, MaxKeys: 100}, func() time.Time { return now })
	first := s.limiterFor("user_a")
	for i := 0; i < 10; i++ {
		now = now.Add(30 * time.Second)
		if s.limiterFor("user_a") != first {
			t.Fatal("an active user's limiter was replaced, which would reset its bucket")
		}
	}
}

func TestLimiterStoreIdleTTLCoversTheRefillTime(t *testing.T) {
	// A bucket that needs 100 s to refill must not be dropped after 1 s idle,
	// or the user would get a full bucket back early.
	s := newLimiterStore(RateLimitConfig{RPS: 0.01, Burst: 1, TTL: time.Second, MaxKeys: 10}, time.Now)
	if s.ttl < 100*time.Second {
		t.Errorf("ttl = %v, want at least the 100 s refill time", s.ttl)
	}
}
