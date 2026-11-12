package sync_test

import (
	"context"
	"encoding/json"
	"errors"
	"sort"
	"testing"
	"time"

	"github.com/John-Santa/fitplan/api/internal/domain"
	"github.com/John-Santa/fitplan/api/internal/sync"
)

// fakeStore keeps records in memory with a global rev sequence and LWW.
type fakeStore struct {
	rev     int64
	docs    map[string]map[domain.DocumentKind]domain.Document
	meas    map[string]map[string]domain.Measurement
	applied int
}

func newFake() *fakeStore {
	return &fakeStore{
		docs: map[string]map[domain.DocumentKind]domain.Document{},
		meas: map[string]map[string]domain.Measurement{},
	}
}

func (f *fakeStore) Changes(_ context.Context, userID string, since int64, limit int) (domain.ChangeSet, error) {
	var cs domain.ChangeSet
	for _, d := range f.docs[userID] {
		if d.Rev > since {
			cs.Documents = append(cs.Documents, d)
		}
	}
	for _, m := range f.meas[userID] {
		if m.Rev > since {
			cs.Measurements = append(cs.Measurements, m)
		}
	}
	sort.Slice(cs.Documents, func(i, j int) bool { return cs.Documents[i].Rev < cs.Documents[j].Rev })
	sort.Slice(cs.Measurements, func(i, j int) bool { return cs.Measurements[i].Rev < cs.Measurements[j].Rev })
	if len(cs.Documents) > limit {
		cs.Documents = cs.Documents[:limit]
	}
	if len(cs.Measurements) > limit {
		cs.Measurements = cs.Measurements[:limit]
	}
	return cs, nil
}

func (f *fakeStore) Apply(_ context.Context, userID string, cs domain.ChangeSet) (domain.PushResult, error) {
	f.applied++
	var res domain.PushResult
	if f.docs[userID] == nil {
		f.docs[userID] = map[domain.DocumentKind]domain.Document{}
		f.meas[userID] = map[string]domain.Measurement{}
	}
	for _, d := range cs.Documents {
		cur, ok := f.docs[userID][d.Kind]
		if ok && d.UpdatedAt.Before(cur.UpdatedAt) {
			res.Documents = append(res.Documents, domain.ItemResult{Key: string(d.Kind), Status: domain.StatusStale})
			continue
		}
		f.rev++
		d.Rev = f.rev
		f.docs[userID][d.Kind] = d
		res.Documents = append(res.Documents, domain.ItemResult{Key: string(d.Kind), Status: domain.StatusApplied, Rev: d.Rev})
	}
	for _, m := range cs.Measurements {
		f.rev++
		m.Rev = f.rev
		f.meas[userID][m.Date] = m
		res.Measurements = append(res.Measurements, domain.ItemResult{Key: m.Date, Status: domain.StatusApplied, Rev: m.Rev})
	}
	return res, nil
}

var t0 = time.UnixMilli(1_700_000_000_000).UTC()

func meas(date string) domain.Measurement {
	return domain.Measurement{Date: date, Body: json.RawMessage(`{"weight":80}`), UpdatedAt: t0}
}

func TestPushRejectsInvalidSetWithoutTouchingStore(t *testing.T) {
	f := newFake()
	svc := sync.NewService(f)
	_, err := svc.Push(context.Background(), "u1", domain.ChangeSet{Measurements: []domain.Measurement{{Date: "bad"}}})
	var verr *domain.ValidationError
	if !errors.As(err, &verr) {
		t.Fatalf("err = %v, want ValidationError", err)
	}
	if f.applied != 0 {
		t.Error("store must not be called for an invalid set")
	}
}

func TestPushRejectsEmptyUser(t *testing.T) {
	_, err := sync.NewService(newFake()).Push(context.Background(), "", domain.ChangeSet{})
	if err == nil {
		t.Fatal("want error for empty user id")
	}
}

func TestPullPaginatesAcrossCollectionsByRev(t *testing.T) {
	f := newFake()
	svc := sync.NewService(f)
	ctx := context.Background()
	// revs: m1=1, plan=2, m2=3, m3=4
	push := func(cs domain.ChangeSet) {
		t.Helper()
		if _, err := svc.Push(ctx, "u1", cs); err != nil {
			t.Fatal(err)
		}
	}
	push(domain.ChangeSet{Measurements: []domain.Measurement{meas("2026-01-01")}})
	push(domain.ChangeSet{Documents: []domain.Document{{Kind: domain.DocumentPlan, Body: json.RawMessage(`{}`), UpdatedAt: t0}}})
	push(domain.ChangeSet{Measurements: []domain.Measurement{meas("2026-01-02"), meas("2026-01-03")}})

	page1, err := svc.Pull(ctx, "u1", 0, 2)
	if err != nil {
		t.Fatal(err)
	}
	if page1.Len() != 2 || !page1.HasMore || page1.Cursor != 2 {
		t.Fatalf("page1 len=%d hasMore=%v cursor=%d, want 2/true/2", page1.Len(), page1.HasMore, page1.Cursor)
	}
	if len(page1.Documents) != 1 || len(page1.Measurements) != 1 || page1.Measurements[0].Date != "2026-01-01" {
		t.Errorf("page1 content = %+v", page1)
	}
	page2, err := svc.Pull(ctx, "u1", page1.Cursor, 2)
	if err != nil {
		t.Fatal(err)
	}
	if page2.Len() != 2 || page2.HasMore || page2.Cursor != 4 {
		t.Fatalf("page2 len=%d hasMore=%v cursor=%d, want 2/false/4", page2.Len(), page2.HasMore, page2.Cursor)
	}
	page3, err := svc.Pull(ctx, "u1", page2.Cursor, 2)
	if err != nil {
		t.Fatal(err)
	}
	if page3.Len() != 0 || page3.HasMore || page3.Cursor != 4 {
		t.Errorf("page3 len=%d hasMore=%v cursor=%d, want 0/false/4 (cursor kept)", page3.Len(), page3.HasMore, page3.Cursor)
	}
}

func TestPullValidatesArguments(t *testing.T) {
	svc := sync.NewService(newFake())
	ctx := context.Background()
	for _, tc := range []struct {
		since int64
		limit int
	}{{-1, 10}, {0, 0}, {0, sync.MaxPullLimit + 1}} {
		_, err := svc.Pull(ctx, "u1", tc.since, tc.limit)
		var verr *domain.ValidationError
		if !errors.As(err, &verr) {
			t.Errorf("since=%d limit=%d: err = %v, want ValidationError", tc.since, tc.limit, err)
		}
	}
}

func TestPushReportsStale(t *testing.T) {
	svc := sync.NewService(newFake())
	ctx := context.Background()
	doc := func(at time.Time) domain.ChangeSet {
		return domain.ChangeSet{Documents: []domain.Document{{Kind: domain.DocumentConfig, Body: json.RawMessage(`{}`), UpdatedAt: at}}}
	}
	if _, err := svc.Push(ctx, "u1", doc(t0.Add(time.Hour))); err != nil {
		t.Fatal(err)
	}
	res, err := svc.Push(ctx, "u1", doc(t0))
	if err != nil {
		t.Fatal(err)
	}
	if res.Documents[0].Status != domain.StatusStale {
		t.Errorf("status = %q, want stale", res.Documents[0].Status)
	}
}

func TestPushClampsFutureTimestampsSoLaterRealEditsApply(t *testing.T) {
	store := newFake()
	svc := sync.NewService(store)
	now := time.Date(2026, 11, 11, 12, 0, 0, 0, time.UTC)
	svc.Now = func() time.Time { return now }
	ctx := context.Background()
	doc := func(at time.Time) domain.ChangeSet {
		return domain.ChangeSet{Documents: []domain.Document{{Kind: domain.DocumentConfig, Body: json.RawMessage(`{}`), UpdatedAt: at}}}
	}
	year2100 := time.Date(2100, 1, 1, 0, 0, 0, 0, time.UTC)
	if _, err := svc.Push(ctx, "u1", doc(year2100)); err != nil {
		t.Fatal(err)
	}
	want := now.Add(10 * time.Minute)
	if got := store.docs["u1"][domain.DocumentConfig].UpdatedAt; !got.Equal(want) {
		t.Fatalf("stored updatedAt = %v, want clamp %v", got, want)
	}
	// An hour later a real edit (current time) beats the clamped copy.
	now = now.Add(time.Hour)
	res, err := svc.Push(ctx, "u1", doc(now))
	if err != nil {
		t.Fatal(err)
	}
	if res.Documents[0].Status != domain.StatusApplied {
		t.Errorf("real edit status = %q, want applied", res.Documents[0].Status)
	}
}

func TestPushClampsDeletedAt(t *testing.T) {
	store := newFake()
	svc := sync.NewService(store)
	now := time.Date(2026, 11, 11, 12, 0, 0, 0, time.UTC)
	svc.Now = func() time.Time { return now }
	far := time.Date(2100, 1, 1, 0, 0, 0, 0, time.UTC)
	cs := domain.ChangeSet{Measurements: []domain.Measurement{{Date: "2026-11-10", Body: json.RawMessage(`{}`), UpdatedAt: far, DeletedAt: &far}}}
	if _, err := svc.Push(context.Background(), "u1", cs); err != nil {
		t.Fatal(err)
	}
	got := store.meas["u1"]["2026-11-10"]
	want := now.Add(10 * time.Minute)
	if !got.UpdatedAt.Equal(want) || got.DeletedAt == nil || !got.DeletedAt.Equal(want) {
		t.Errorf("stored = %v / %v, want both %v", got.UpdatedAt, got.DeletedAt, want)
	}
}
