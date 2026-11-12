package sync_test

import (
	"encoding/json"
	"errors"
	"strings"
	"testing"
	"time"

	domain "github.com/John-Santa/fitplan/api/internal/domain/sync"
)

var t0 = time.UnixMilli(1_700_000_000_000).UTC()

func validSet() domain.ChangeSet {
	return domain.ChangeSet{
		Documents: []domain.Document{{Kind: domain.DocumentPlan, Body: json.RawMessage(`{"phases":[]}`), UpdatedAt: t0}},
		Sessions: []domain.Session{{
			ID:        "s1",
			Body:      json.RawMessage(`{"id":"s1","kind":"swim","date":"2026-11-10","startedAt":1,"finishedAt":1700000000000}`),
			UpdatedAt: t0,
		}},
		Measurements: []domain.Measurement{{Date: "2026-11-10", Body: json.RawMessage(`{"date":"2026-11-10","weight":80}`), UpdatedAt: t0}},
		ExerciseMeta: []domain.ExerciseMeta{{ExerciseID: "press", Body: json.RawMessage(`{"exerciseId":"press","seat":"3","note":""}`), UpdatedAt: t0}},
	}
}

func TestValidateAcceptsValidSetAndDerivesSessionColumns(t *testing.T) {
	cs := validSet()
	if err := cs.Validate(); err != nil {
		t.Fatalf("Validate: %v", err)
	}
	s := cs.Sessions[0]
	if s.Kind != domain.SessionSwim || s.Date != "2026-11-10" {
		t.Errorf("derived kind/date = %q/%q", s.Kind, s.Date)
	}
	if s.FinishedAt == nil || !s.FinishedAt.Equal(time.UnixMilli(1700000000000)) {
		t.Errorf("derived finishedAt = %v", s.FinishedAt)
	}
}

func TestValidateSessionInProgressHasNilFinishedAt(t *testing.T) {
	cs := domain.ChangeSet{Sessions: []domain.Session{{
		ID: "s2", Body: json.RawMessage(`{"id":"s2","kind":"strength","date":"2026-11-10","finishedAt":null}`), UpdatedAt: t0,
	}}}
	if err := cs.Validate(); err != nil {
		t.Fatalf("Validate: %v", err)
	}
	if cs.Sessions[0].FinishedAt != nil {
		t.Errorf("finishedAt = %v, want nil", cs.Sessions[0].FinishedAt)
	}
}

func sessionBody(extra string) json.RawMessage {
	return json.RawMessage(`{"id":"s1","kind":"swim","date":"2026-11-10",` + extra + `}`)
}

func TestValidateAcceptsTimestampBounds(t *testing.T) {
	cs := validSet()
	max := time.UnixMilli(domain.MaxTimestampMillis)
	cs.Documents[0].UpdatedAt = max
	cs.Documents[0].DeletedAt = &max
	zero := time.UnixMilli(0)
	cs.Measurements[0].DeletedAt = &zero
	cs.Sessions[0].Body = sessionBody(`"startedAt":0,"finishedAt":253402300799999`)
	if err := cs.Validate(); err != nil {
		t.Fatalf("Validate: %v", err)
	}
}

func TestClampFutureCapsUpdatedAtAndDeletedAt(t *testing.T) {
	cs := validSet()
	limit := t0.Add(10 * time.Minute)
	far := time.Date(2100, 1, 1, 0, 0, 0, 0, time.UTC)
	cs.Documents[0].UpdatedAt = far
	cs.Sessions[0].DeletedAt = &far
	cs.Measurements[0].UpdatedAt = limit.Add(-time.Second) // below the limit: untouched
	cs.ExerciseMeta[0].UpdatedAt = far
	cs.ClampFuture(limit)
	if !cs.Documents[0].UpdatedAt.Equal(limit) || !cs.ExerciseMeta[0].UpdatedAt.Equal(limit) {
		t.Errorf("updatedAt not clamped: %v %v", cs.Documents[0].UpdatedAt, cs.ExerciseMeta[0].UpdatedAt)
	}
	if cs.Sessions[0].DeletedAt == nil || !cs.Sessions[0].DeletedAt.Equal(limit) {
		t.Errorf("deletedAt = %v, want %v", cs.Sessions[0].DeletedAt, limit)
	}
	if !cs.Measurements[0].UpdatedAt.Equal(limit.Add(-time.Second)) {
		t.Errorf("value below the limit changed: %v", cs.Measurements[0].UpdatedAt)
	}
	if !far.Equal(time.Date(2100, 1, 1, 0, 0, 0, 0, time.UTC)) {
		t.Error("caller's time mutated")
	}
}

func TestValidateRejects(t *testing.T) {
	big := `{"x":"` + strings.Repeat("a", domain.MaxBodyBytes) + `"}`
	cases := []struct {
		name   string
		mutate func(cs *domain.ChangeSet)
		want   string
	}{
		{"document kind", func(cs *domain.ChangeSet) { cs.Documents[0].Kind = "habits" }, "documents[0].kind"},
		{"document body not object", func(cs *domain.ChangeSet) { cs.Documents[0].Body = json.RawMessage(`[1]`) }, "documents[0].body"},
		{"document body invalid json", func(cs *domain.ChangeSet) { cs.Documents[0].Body = json.RawMessage(`{`) }, "documents[0].body"},
		{"document body missing", func(cs *domain.ChangeSet) { cs.Documents[0].Body = nil }, "documents[0].body"},
		{"body too large", func(cs *domain.ChangeSet) { cs.Documents[0].Body = json.RawMessage(big) }, "documents[0].body"},
		{"updatedAt missing", func(cs *domain.ChangeSet) { cs.Documents[0].UpdatedAt = time.Time{} }, "documents[0].updatedAt"},
		{"session id empty", func(cs *domain.ChangeSet) { cs.Sessions[0].ID = "" }, "sessions[0].id"},
		{"session id too long", func(cs *domain.ChangeSet) { cs.Sessions[0].ID = strings.Repeat("x", 129) }, "sessions[0].id"},
		{"session id mismatch", func(cs *domain.ChangeSet) { cs.Sessions[0].ID = "other" }, "sessions[0].body.id"},
		{"session kind", func(cs *domain.ChangeSet) {
			cs.Sessions[0].Body = json.RawMessage(`{"id":"s1","kind":"run","date":"2026-11-10"}`)
		}, "sessions[0].body.kind"},
		{"session date", func(cs *domain.ChangeSet) {
			cs.Sessions[0].Body = json.RawMessage(`{"id":"s1","kind":"swim","date":"10/11/2026"}`)
		}, "sessions[0].body.date"},
		{"session finishedAt type", func(cs *domain.ChangeSet) {
			cs.Sessions[0].Body = json.RawMessage(`{"id":"s1","kind":"swim","date":"2026-11-10","finishedAt":"x"}`)
		}, "sessions[0].body"},
		{"measurement date", func(cs *domain.ChangeSet) { cs.Measurements[0].Date = "2026-13-01" }, "measurements[0].date"},
		{"measurement date mismatch", func(cs *domain.ChangeSet) { cs.Measurements[0].Date = "2026-11-11" }, "measurements[0].body.date"},
		{"exercise id empty", func(cs *domain.ChangeSet) { cs.ExerciseMeta[0].ExerciseID = "" }, "exerciseMeta[0].exerciseId"},
		{"session id NUL", func(cs *domain.ChangeSet) { cs.Sessions[0].ID = "s1\x00" }, "sessions[0].id"},
		{"exercise id NUL", func(cs *domain.ChangeSet) { cs.ExerciseMeta[0].ExerciseID = "press\x00" }, "exerciseMeta[0].exerciseId"},
		{"measurement date NUL", func(cs *domain.ChangeSet) { cs.Measurements[0].Date = "2026-11-1\x00" }, "measurements[0].date"},
		{"body with \\u0000 escape", func(cs *domain.ChangeSet) {
			cs.Documents[0].Body = json.RawMessage(`{"note":"a\u0000b"}`)
		}, "documents[0].body"},
		{"session body with \\u0000 escape", func(cs *domain.ChangeSet) {
			cs.Sessions[0].Body = json.RawMessage(`{"id":"s1","kind":"swim","date":"2026-11-10","note":"\u0000"}`)
		}, "sessions[0].body"},
		{"updatedAt out of range", func(cs *domain.ChangeSet) { cs.Documents[0].UpdatedAt = time.UnixMilli(9_000_000_000_000_000_000) }, "documents[0].updatedAt"},
		{"updatedAt beyond year 9999", func(cs *domain.ChangeSet) { cs.Documents[0].UpdatedAt = time.UnixMilli(253_402_300_800_000) }, "documents[0].updatedAt"},
		{"updatedAt negative", func(cs *domain.ChangeSet) { cs.Documents[0].UpdatedAt = time.UnixMilli(-5) }, "documents[0].updatedAt"},
		{"deletedAt out of range", func(cs *domain.ChangeSet) {
			d := time.UnixMilli(9_000_000_000_000_000_000)
			cs.Measurements[0].DeletedAt = &d
		}, "measurements[0].deletedAt"},
		{"deletedAt negative", func(cs *domain.ChangeSet) {
			d := time.UnixMilli(-5)
			cs.ExerciseMeta[0].DeletedAt = &d
		}, "exerciseMeta[0].deletedAt"},
		{"finishedAt 1e20", func(cs *domain.ChangeSet) { cs.Sessions[0].Body = sessionBody(`"finishedAt":1e20`) }, "sessions[0].body.finishedAt"},
		{"finishedAt -1e20", func(cs *domain.ChangeSet) { cs.Sessions[0].Body = sessionBody(`"finishedAt":-1e20`) }, "sessions[0].body.finishedAt"},
		{"finishedAt 1e300", func(cs *domain.ChangeSet) { cs.Sessions[0].Body = sessionBody(`"finishedAt":1e300`) }, "sessions[0].body.finishedAt"},
		{"finishedAt negative", func(cs *domain.ChangeSet) { cs.Sessions[0].Body = sessionBody(`"finishedAt":-5`) }, "sessions[0].body.finishedAt"},
		{"finishedAt fractional", func(cs *domain.ChangeSet) { cs.Sessions[0].Body = sessionBody(`"finishedAt":1.5`) }, "sessions[0].body.finishedAt"},
		{"startedAt 1e20", func(cs *domain.ChangeSet) { cs.Sessions[0].Body = sessionBody(`"startedAt":1e20`) }, "sessions[0].body.startedAt"},
		{"startedAt negative", func(cs *domain.ChangeSet) { cs.Sessions[0].Body = sessionBody(`"startedAt":-1`) }, "sessions[0].body.startedAt"},
		{"session date year 0", func(cs *domain.ChangeSet) {
			cs.Sessions[0].Body = json.RawMessage(`{"id":"s1","kind":"swim","date":"0000-01-01"}`)
		}, "sessions[0].body.date"},
		{"measurement date year 0", func(cs *domain.ChangeSet) {
			cs.Measurements[0].Date = "0000-01-01"
			cs.Measurements[0].Body = json.RawMessage(`{"date":"0000-01-01"}`)
		}, "measurements[0].date"},
		{"exercise id mismatch", func(cs *domain.ChangeSet) { cs.ExerciseMeta[0].ExerciseID = "squat" }, "exerciseMeta[0].body.exerciseId"},
	}
	for _, tc := range cases {
		t.Run(tc.name, func(t *testing.T) {
			cs := validSet()
			tc.mutate(&cs)
			err := cs.Validate()
			var verr *domain.ValidationError
			if !errors.As(err, &verr) {
				t.Fatalf("err = %v, want *ValidationError", err)
			}
			if !strings.HasPrefix(verr.Error(), tc.want) {
				t.Errorf("err = %q, want prefix %q", verr.Error(), tc.want)
			}
		})
	}
}

func TestValidateTombstoneKeepsBodyRules(t *testing.T) {
	cs := validSet()
	del := t0.Add(time.Minute)
	cs.Measurements[0].DeletedAt = &del
	if err := cs.Validate(); err != nil {
		t.Fatalf("tombstone with body: %v", err)
	}
}

func TestChangeSetLen(t *testing.T) {
	cs := validSet()
	if n := cs.Len(); n != 4 {
		t.Errorf("Len = %d, want 4", n)
	}
}
