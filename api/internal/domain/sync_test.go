package domain_test

import (
	"encoding/json"
	"errors"
	"strings"
	"testing"
	"time"

	"github.com/John-Santa/fitplan/api/internal/domain"
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
