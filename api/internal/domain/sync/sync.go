// Package sync holds the offline-first sync model: the records a client
// pushes and pulls, their validation, and the future-timestamp clamp.
// It depends only on the standard library and domain/shared.
package sync

import (
	"bytes"
	"encoding/json"
	"fmt"
	"math"
	"strings"
	"time"

	"github.com/John-Santa/fitplan/api/internal/domain/shared"
)

// Limits applied to every pushed record.
const (
	// MaxIDLength is the maximum length of a session or exercise id.
	MaxIDLength = 128
	// MaxBodyBytes is the maximum size of one record body.
	MaxBodyBytes = 256 * 1024
	// DateLayout is the local-day format shared with the front (YYYY-MM-DD).
	DateLayout = "2006-01-02"
	// MaxTimestampMillis is the largest accepted epoch-millisecond timestamp
	// (9999-12-31T23:59:59.999Z, the Postgres timestamptz-safe range).
	MaxTimestampMillis int64 = 253_402_300_799_999
)

// DocumentKind names the per-user singleton documents.
type DocumentKind string

const (
	DocumentPlan   DocumentKind = "plan"
	DocumentConfig DocumentKind = "config"
)

// SessionKind is the discipline of a workout session.
type SessionKind string

const (
	SessionStrength SessionKind = "strength"
	SessionSwim     SessionKind = "swim"
)

// Document is the plan or the config of one user, stored as one JSON object.
type Document struct {
	Kind      DocumentKind
	Body      json.RawMessage
	UpdatedAt time.Time  // client last-write time, used for last-write-wins
	DeletedAt *time.Time // tombstone
	Rev       int64      // server change sequence, assigned on write
}

// Session is one workout session. Kind, Date and FinishedAt are derived from
// Body by Validate; they are never trusted from elsewhere.
type Session struct {
	ID         string
	Kind       SessionKind
	Date       string
	FinishedAt *time.Time
	Body       json.RawMessage
	UpdatedAt  time.Time
	DeletedAt  *time.Time
	Rev        int64
}

// Measurement is the body measurement of one local day.
type Measurement struct {
	Date      string
	Body      json.RawMessage
	UpdatedAt time.Time
	DeletedAt *time.Time
	Rev       int64
}

// ExerciseMeta holds per-exercise machine notes.
type ExerciseMeta struct {
	ExerciseID string
	Body       json.RawMessage
	UpdatedAt  time.Time
	DeletedAt  *time.Time
	Rev        int64
}

// ChangeSet is the unit of sync in both directions. On pull, Cursor is the
// rev to send as "since" next time and HasMore tells whether to pull again.
type ChangeSet struct {
	Documents    []Document
	Sessions     []Session
	Measurements []Measurement
	ExerciseMeta []ExerciseMeta
	Cursor       int64
	HasMore      bool
}

// Len returns the number of records in the set.
func (cs ChangeSet) Len() int {
	return len(cs.Documents) + len(cs.Sessions) + len(cs.Measurements) + len(cs.ExerciseMeta)
}

// ItemStatus is the outcome of pushing one record.
type ItemStatus string

const (
	// StatusApplied means the record was written and got a new Rev.
	StatusApplied ItemStatus = "applied"
	// StatusStale means the server copy is newer (last write wins); nothing changed.
	StatusStale ItemStatus = "stale"
)

// ItemResult reports the outcome of one pushed record, keyed by its natural key.
type ItemResult struct {
	Key    string
	Status ItemStatus
	Rev    int64 // zero when stale
}

// PushResult holds one ItemResult per pushed record, in input order.
type PushResult struct {
	Documents    []ItemResult
	Sessions     []ItemResult
	Measurements []ItemResult
	ExerciseMeta []ItemResult
}

// ValidationError is the shared field-path validation error.
type ValidationError = shared.ValidationError

func invalid(field, format string, args ...any) error {
	return shared.Invalid(field, format, args...)
}

// Validate checks every record and derives the session columns from the body.
func (cs *ChangeSet) Validate() error {
	for i := range cs.Documents {
		d := &cs.Documents[i]
		p := fmt.Sprintf("documents[%d]", i)
		if d.Kind != DocumentPlan && d.Kind != DocumentConfig {
			return invalid(p+".kind", "must be plan or config, got %q", d.Kind)
		}
		if err := checkCommon(p, d.Body, d.UpdatedAt, d.DeletedAt); err != nil {
			return err
		}
	}
	for i := range cs.Sessions {
		if err := validateSession(fmt.Sprintf("sessions[%d]", i), &cs.Sessions[i]); err != nil {
			return err
		}
	}
	for i := range cs.Measurements {
		m := &cs.Measurements[i]
		p := fmt.Sprintf("measurements[%d]", i)
		if !IsDate(m.Date) {
			return invalid(p+".date", "must be a valid YYYY-MM-DD date")
		}
		if err := checkCommon(p, m.Body, m.UpdatedAt, m.DeletedAt); err != nil {
			return err
		}
		if err := checkBodyKey(p+".body.date", m.Body, "date", m.Date); err != nil {
			return err
		}
	}
	for i := range cs.ExerciseMeta {
		e := &cs.ExerciseMeta[i]
		p := fmt.Sprintf("exerciseMeta[%d]", i)
		if err := checkID(p+".exerciseId", e.ExerciseID); err != nil {
			return err
		}
		if err := checkCommon(p, e.Body, e.UpdatedAt, e.DeletedAt); err != nil {
			return err
		}
		if err := checkBodyKey(p+".body.exerciseId", e.Body, "exerciseId", e.ExerciseID); err != nil {
			return err
		}
	}
	return nil
}

func validateSession(p string, s *Session) error {
	if err := checkID(p+".id", s.ID); err != nil {
		return err
	}
	if err := checkCommon(p, s.Body, s.UpdatedAt, s.DeletedAt); err != nil {
		return err
	}
	var b struct {
		ID         *string  `json:"id"`
		Kind       string   `json:"kind"`
		Date       string   `json:"date"`
		StartedAt  *float64 `json:"startedAt"`
		FinishedAt *float64 `json:"finishedAt"`
	}
	if err := json.Unmarshal(s.Body, &b); err != nil {
		return invalid(p+".body", "invalid session fields: %v", err)
	}
	if b.ID != nil && *b.ID != s.ID {
		return invalid(p+".body.id", "must match the record id %q", s.ID)
	}
	kind := SessionKind(b.Kind)
	if kind != SessionStrength && kind != SessionSwim {
		return invalid(p+".body.kind", "must be strength or swim, got %q", b.Kind)
	}
	if !IsDate(b.Date) {
		return invalid(p+".body.date", "must be a valid YYYY-MM-DD date")
	}
	if b.StartedAt != nil {
		if _, err := bodyMillis(p+".body.startedAt", *b.StartedAt); err != nil {
			return err
		}
	}
	s.Kind, s.Date, s.FinishedAt = kind, b.Date, nil
	if b.FinishedAt != nil {
		ms, err := bodyMillis(p+".body.finishedAt", *b.FinishedAt)
		if err != nil {
			return err
		}
		t := time.UnixMilli(ms).UTC()
		s.FinishedAt = &t
	}
	return nil
}

// bodyMillis converts a JSON number from a record body to epoch milliseconds,
// rejecting fractions and anything outside [0, MaxTimestampMillis].
func bodyMillis(field string, v float64) (int64, error) {
	if v != math.Trunc(v) || v < 0 || v > float64(MaxTimestampMillis) {
		return 0, invalid(field, "must be an integer of epoch milliseconds between 0 and %d", MaxTimestampMillis)
	}
	return int64(v), nil
}

func checkID(field, id string) error {
	if id == "" {
		return invalid(field, "is required")
	}
	if len(id) > MaxIDLength {
		return invalid(field, "must be at most %d characters", MaxIDLength)
	}
	if strings.ContainsRune(id, 0) {
		return invalid(field, "must not contain NUL characters")
	}
	return nil
}

func checkCommon(p string, body json.RawMessage, updatedAt time.Time, deletedAt *time.Time) error {
	if len(body) > MaxBodyBytes {
		return invalid(p+".body", "must be at most %d bytes", MaxBodyBytes)
	}
	trimmed := bytes.TrimSpace(body)
	if len(trimmed) == 0 || trimmed[0] != '{' || !json.Valid(trimmed) {
		return invalid(p+".body", "must be a JSON object")
	}
	// Postgres text and jsonb reject NUL; it can only appear as the escape
	// \u0000 inside a valid JSON document.
	if bytes.Contains(trimmed, []byte(`\u0000`)) {
		return invalid(p+".body", "must not contain the \\u0000 escape")
	}
	if ms := updatedAt.UnixMilli(); ms <= 0 {
		return invalid(p+".updatedAt", "is required (epoch milliseconds)")
	} else if ms > MaxTimestampMillis {
		return invalid(p+".updatedAt", "must be at most %d (epoch milliseconds)", MaxTimestampMillis)
	}
	if deletedAt != nil {
		if ms := deletedAt.UnixMilli(); ms < 0 || ms > MaxTimestampMillis {
			return invalid(p+".deletedAt", "must be between 0 and %d (epoch milliseconds)", MaxTimestampMillis)
		}
	}
	return nil
}

// checkBodyKey rejects a body whose own key field disagrees with the record key.
// A body without that field is accepted.
func checkBodyKey(field string, body json.RawMessage, name, want string) error {
	var m map[string]json.RawMessage
	if err := json.Unmarshal(body, &m); err != nil {
		return invalid(field, "unreadable body: %v", err)
	}
	raw, ok := m[name]
	if !ok {
		return nil
	}
	var got string
	if err := json.Unmarshal(raw, &got); err != nil || got != want {
		return invalid(field, "must match the record key %q", want)
	}
	return nil
}

// IsDate reports whether s is a real calendar date in YYYY-MM-DD form.
func IsDate(s string) bool {
	if len(s) != len(DateLayout) {
		return false
	}
	t, err := time.Parse(DateLayout, s)
	return err == nil && t.Year() >= 1
}

// ClampFuture caps every updatedAt and deletedAt at limit. A client clock far
// in the future would otherwise pin a record forever under last-write-wins.
// Call it after Validate; values at or below limit are left untouched.
func (cs *ChangeSet) ClampFuture(limit time.Time) {
	clamp := func(t time.Time) time.Time {
		if t.After(limit) {
			return limit
		}
		return t
	}
	clampPtr := func(t *time.Time) *time.Time {
		if t == nil || !t.After(limit) {
			return t
		}
		c := limit
		return &c
	}
	for i := range cs.Documents {
		cs.Documents[i].UpdatedAt = clamp(cs.Documents[i].UpdatedAt)
		cs.Documents[i].DeletedAt = clampPtr(cs.Documents[i].DeletedAt)
	}
	for i := range cs.Sessions {
		cs.Sessions[i].UpdatedAt = clamp(cs.Sessions[i].UpdatedAt)
		cs.Sessions[i].DeletedAt = clampPtr(cs.Sessions[i].DeletedAt)
	}
	for i := range cs.Measurements {
		cs.Measurements[i].UpdatedAt = clamp(cs.Measurements[i].UpdatedAt)
		cs.Measurements[i].DeletedAt = clampPtr(cs.Measurements[i].DeletedAt)
	}
	for i := range cs.ExerciseMeta {
		cs.ExerciseMeta[i].UpdatedAt = clamp(cs.ExerciseMeta[i].UpdatedAt)
		cs.ExerciseMeta[i].DeletedAt = clampPtr(cs.ExerciseMeta[i].DeletedAt)
	}
}
