package postgres_test

import (
	"context"
	"encoding/json"
	"os"
	stdsync "sync"
	"testing"
	"time"

	"github.com/jackc/pgx/v5/pgxpool"

	"github.com/John-Santa/fitplan/api/internal/adapter/postgres"
	domain "github.com/John-Santa/fitplan/api/internal/domain/sync"
	"github.com/John-Santa/fitplan/api/internal/platform/postgresdb"
	"github.com/John-Santa/fitplan/api/internal/port"
	sync "github.com/John-Santa/fitplan/api/internal/usecase/sync"
)

// newService connects to TEST_DATABASE_URL, migrates, and truncates all data.
// Tests skip when the variable is unset.
func newService(t *testing.T) (*sync.Service, *pgxpool.Pool) {
	t.Helper()
	return newServiceWithClock(t, nil)
}

func newServiceWithClock(t *testing.T, clock port.Clock) (*sync.Service, *pgxpool.Pool) {
	t.Helper()
	url := os.Getenv("TEST_DATABASE_URL")
	if url == "" {
		t.Skip("TEST_DATABASE_URL not set; skipping Postgres integration test")
	}
	ctx := context.Background()
	pool, err := postgresdb.Open(ctx, url)
	if err != nil {
		t.Fatalf("open: %v", err)
	}
	t.Cleanup(pool.Close)
	if err := postgres.Migrate(ctx, pool); err != nil {
		t.Fatalf("migrate: %v", err)
	}
	if _, err := pool.Exec(ctx, `TRUNCATE users, deleted_users CASCADE`); err != nil {
		t.Fatalf("truncate: %v", err)
	}
	st := postgres.NewSyncStore(pool)
	return sync.NewService(sync.Deps{Reader: st, Writer: st, Clock: clock}), pool
}

var t0 = time.UnixMilli(1_700_000_000_000).UTC()

func fullSet(at time.Time) domain.ChangeSet {
	return domain.ChangeSet{
		Documents: []domain.Document{{Kind: domain.DocumentPlan, Body: json.RawMessage(`{"phases":[1]}`), UpdatedAt: at}},
		Sessions: []domain.Session{{
			ID:        "s1",
			Body:      json.RawMessage(`{"id":"s1","kind":"strength","date":"2026-11-10","startedAt":1,"finishedAt":1700000000000}`),
			UpdatedAt: at,
		}},
		Measurements: []domain.Measurement{{Date: "2026-11-10", Body: json.RawMessage(`{"date":"2026-11-10","weight":80}`), UpdatedAt: at}},
		ExerciseMeta: []domain.ExerciseMeta{{ExerciseID: "press", Body: json.RawMessage(`{"seat":"3"}`), UpdatedAt: at}},
	}
}

func TestPushPullRoundTrip(t *testing.T) {
	svc, pool := newService(t)
	ctx := context.Background()
	res, err := svc.Push(ctx, "user_a", fullSet(t0))
	if err != nil {
		t.Fatalf("push: %v", err)
	}
	for _, r := range [][]domain.ItemResult{res.Documents, res.Sessions, res.Measurements, res.ExerciseMeta} {
		if len(r) != 1 || r[0].Status != domain.StatusApplied || r[0].Rev == 0 {
			t.Fatalf("result = %+v, want applied with rev", r)
		}
	}
	got, err := svc.Pull(ctx, "user_a", 0, 100)
	if err != nil {
		t.Fatalf("pull: %v", err)
	}
	if got.Len() != 4 || got.HasMore {
		t.Fatalf("pull len=%d hasMore=%v", got.Len(), got.HasMore)
	}
	s := got.Sessions[0]
	if s.ID != "s1" || s.Kind != domain.SessionStrength || s.Date != "2026-11-10" || s.FinishedAt == nil ||
		!s.FinishedAt.Equal(time.UnixMilli(1700000000000)) || !s.UpdatedAt.Equal(t0) || s.DeletedAt != nil {
		t.Errorf("session = %+v", s)
	}
	var body map[string]any
	if err := json.Unmarshal(got.Documents[0].Body, &body); err != nil || body["phases"] == nil {
		t.Errorf("document body = %s", got.Documents[0].Body)
	}
	if got.Measurements[0].Date != "2026-11-10" || got.ExerciseMeta[0].ExerciseID != "press" {
		t.Errorf("keys = %q %q", got.Measurements[0].Date, got.ExerciseMeta[0].ExerciseID)
	}
	var maxRev int64
	if err := pool.QueryRow(ctx, `SELECT max(rev) FROM sessions`).Scan(&maxRev); err != nil || got.Cursor < maxRev {
		t.Errorf("cursor = %d, want >= %d (%v)", got.Cursor, maxRev, err)
	}
	// Derived columns are stored, not only the body.
	var kind string
	var date time.Time
	if err := pool.QueryRow(ctx, `SELECT kind, date FROM sessions WHERE user_id='user_a' AND id='s1'`).Scan(&kind, &date); err != nil ||
		kind != "strength" || date.Format("2006-01-02") != "2026-11-10" {
		t.Errorf("stored kind/date = %q/%v (%v)", kind, date, err)
	}
}

func TestStaleWriteIsIgnored(t *testing.T) {
	svc, _ := newService(t)
	ctx := context.Background()
	newer := domain.ChangeSet{Measurements: []domain.Measurement{{Date: "2026-11-10", Body: json.RawMessage(`{"weight":81}`), UpdatedAt: t0.Add(time.Hour)}}}
	older := domain.ChangeSet{Measurements: []domain.Measurement{{Date: "2026-11-10", Body: json.RawMessage(`{"weight":70}`), UpdatedAt: t0}}}
	if _, err := svc.Push(ctx, "user_a", newer); err != nil {
		t.Fatal(err)
	}
	res, err := svc.Push(ctx, "user_a", older)
	if err != nil {
		t.Fatal(err)
	}
	if res.Measurements[0].Status != domain.StatusStale || res.Measurements[0].Rev != 0 {
		t.Errorf("result = %+v, want stale", res.Measurements[0])
	}
	got, _ := svc.Pull(ctx, "user_a", 0, 10)
	if len(got.Measurements) != 1 || string(got.Measurements[0].Body) != `{"weight": 81}` {
		t.Errorf("stored body = %s, want the newer one", got.Measurements[0].Body)
	}
}

func TestTombstoneIsPulled(t *testing.T) {
	svc, _ := newService(t)
	ctx := context.Background()
	if _, err := svc.Push(ctx, "user_a", fullSet(t0)); err != nil {
		t.Fatal(err)
	}
	first, _ := svc.Pull(ctx, "user_a", 0, 100)
	del := t0.Add(time.Minute)
	tomb := fullSet(del)
	tomb.Sessions[0].DeletedAt = &del
	tomb.Documents, tomb.Measurements, tomb.ExerciseMeta = nil, nil, nil
	if _, err := svc.Push(ctx, "user_a", tomb); err != nil {
		t.Fatal(err)
	}
	got, err := svc.Pull(ctx, "user_a", first.Cursor, 100)
	if err != nil {
		t.Fatal(err)
	}
	if got.Len() != 1 || len(got.Sessions) != 1 || got.Sessions[0].DeletedAt == nil || !got.Sessions[0].DeletedAt.Equal(del) {
		t.Fatalf("pull after delete = %+v, want one session tombstone", got)
	}
}

func TestUserIsolation(t *testing.T) {
	svc, _ := newService(t)
	ctx := context.Background()
	if _, err := svc.Push(ctx, "user_a", fullSet(t0.Add(time.Hour))); err != nil {
		t.Fatal(err)
	}
	b, err := svc.Pull(ctx, "user_b", 0, 100)
	if err != nil {
		t.Fatal(err)
	}
	if b.Len() != 0 {
		t.Fatalf("user_b sees %d records of user_a", b.Len())
	}
	// user_b writes the same keys with an OLDER timestamp: must apply to B only.
	res, err := svc.Push(ctx, "user_b", fullSet(t0))
	if err != nil {
		t.Fatal(err)
	}
	if res.Sessions[0].Status != domain.StatusApplied {
		t.Errorf("user_b push = %+v, want applied (own row)", res.Sessions[0])
	}
	a, _ := svc.Pull(ctx, "user_a", 0, 100)
	if a.Len() != 4 || !a.Sessions[0].UpdatedAt.Equal(t0.Add(time.Hour)) {
		t.Errorf("user_a data changed by user_b: %+v", a.Sessions)
	}
	b, _ = svc.Pull(ctx, "user_b", 0, 100)
	if b.Len() != 4 || !b.Sessions[0].UpdatedAt.Equal(t0) {
		t.Errorf("user_b data = %+v", b.Sessions)
	}
}

func TestCursorPagination(t *testing.T) {
	svc, _ := newService(t)
	ctx := context.Background()
	if _, err := svc.Push(ctx, "user_a", fullSet(t0)); err != nil {
		t.Fatal(err)
	}
	seen := map[int64]bool{}
	var cursor int64
	for page := 0; ; page++ {
		got, err := svc.Pull(ctx, "user_a", cursor, 3)
		if err != nil {
			t.Fatal(err)
		}
		if page == 0 && (got.Len() != 3 || !got.HasMore) {
			t.Fatalf("page0 len=%d hasMore=%v, want 3/true", got.Len(), got.HasMore)
		}
		for _, r := range revs(got) {
			if seen[r] {
				t.Errorf("rev %d returned twice", r)
			}
			seen[r] = true
		}
		cursor = got.Cursor
		if !got.HasMore {
			break
		}
		if page > 5 {
			t.Fatal("pagination does not terminate")
		}
	}
	if len(seen) != 4 {
		t.Errorf("saw %d records across pages, want 4", len(seen))
	}
}

func revs(cs domain.ChangeSet) []int64 {
	var out []int64
	for _, d := range cs.Documents {
		out = append(out, d.Rev)
	}
	for _, s := range cs.Sessions {
		out = append(out, s.Rev)
	}
	for _, m := range cs.Measurements {
		out = append(out, m.Rev)
	}
	for _, e := range cs.ExerciseMeta {
		out = append(out, e.Rev)
	}
	return out
}

func TestPushClampsFutureTimestamp(t *testing.T) {
	now := time.Now().UTC().Truncate(time.Millisecond)
	svc, _ := newServiceWithClock(t, port.ClockFunc(func() time.Time { return now }))
	ctx := context.Background()
	far := time.Date(2100, 1, 1, 0, 0, 0, 0, time.UTC)
	set := func(at time.Time, body string) domain.ChangeSet {
		return domain.ChangeSet{Measurements: []domain.Measurement{{Date: "2026-11-10", Body: json.RawMessage(body), UpdatedAt: at}}}
	}
	if _, err := svc.Push(ctx, "user_a", set(far, `{"weight":99}`)); err != nil {
		t.Fatal(err)
	}
	got, _ := svc.Pull(ctx, "user_a", 0, 10)
	if want := now.Add(10 * time.Minute); len(got.Measurements) != 1 || !got.Measurements[0].UpdatedAt.Equal(want) {
		t.Fatalf("stored = %+v, want updatedAt %v", got.Measurements, want)
	}
	now = now.Add(time.Hour)
	res, err := svc.Push(ctx, "user_a", set(now, `{"weight":80}`))
	if err != nil || res.Measurements[0].Status != domain.StatusApplied {
		t.Fatalf("real edit = %+v, %v; want applied", res, err)
	}
}

func TestConcurrentMigrateSerializes(t *testing.T) {
	_, pool := newService(t)
	ctx := context.Background()
	// Start from an empty schema so every goroutine really has work to do.
	if _, err := pool.Exec(ctx, `DROP SCHEMA public CASCADE; CREATE SCHEMA public`); err != nil {
		t.Fatalf("reset schema: %v", err)
	}
	var wg stdsync.WaitGroup
	errs := make(chan error, 8)
	for i := 0; i < 8; i++ {
		wg.Add(1)
		go func() {
			defer wg.Done()
			errs <- postgres.Migrate(ctx, pool)
		}()
	}
	wg.Wait()
	close(errs)
	for err := range errs {
		if err != nil {
			t.Errorf("concurrent Migrate: %v", err)
		}
	}
}
