package httpapi

import (
	"context"
	"encoding/json"
	"errors"
	"io"
	"log/slog"
	"net/http"
	"strconv"
	"time"

	"github.com/John-Santa/fitplan/api/internal/domain/shared"
	domain "github.com/John-Santa/fitplan/api/internal/domain/sync"
	"github.com/John-Santa/fitplan/api/internal/port"
)

// MaxPushBytes caps the body of POST /v1/sync.
const MaxPushBytes = 5 << 20

const (
	defaultPullLimit = 200
	maxPullLimit     = 500
)

// SyncService is the use case the sync routes depend on (consumer-side port).
type SyncService interface {
	Pull(ctx context.Context, userID shared.UserID, since int64, limit int) (domain.ChangeSet, error)
	Push(ctx context.Context, userID shared.UserID, cs domain.ChangeSet) (domain.PushResult, error)
}

type syncHandlers struct {
	svc SyncService
	log *slog.Logger
}

// user reads the id the auth middleware stored; it answers 401 itself when
// missing, as a second line of defense.
func (v syncHandlers) user(w http.ResponseWriter, r *http.Request) (shared.UserID, bool) {
	id, ok := port.UserIDFrom(r.Context())
	if !ok {
		writeUnauthorized(w, r)
	}
	return id, ok
}

func (v syncHandlers) me(w http.ResponseWriter, r *http.Request) {
	id, ok := v.user(w, r)
	if !ok {
		return
	}
	WriteJSON(w, http.StatusOK, meResponse{UserID: string(id)})
}

func (v syncHandlers) pull(w http.ResponseWriter, r *http.Request) {
	id, ok := v.user(w, r)
	if !ok {
		return
	}
	q := r.URL.Query()
	since := int64(0)
	if raw := q.Get("since"); raw != "" {
		n, err := strconv.ParseInt(raw, 10, 64)
		if err != nil || n < 0 {
			WriteProblem(w, http.StatusBadRequest, "since: must be a non-negative integer")
			return
		}
		since = n
	}
	limit := defaultPullLimit
	if raw := q.Get("limit"); raw != "" {
		n, err := strconv.Atoi(raw)
		if err != nil || n < 1 || n > maxPullLimit {
			WriteProblem(w, http.StatusBadRequest, "limit: must be an integer between 1 and "+strconv.Itoa(maxPullLimit))
			return
		}
		limit = n
	}
	cs, err := v.svc.Pull(r.Context(), id, since, limit)
	if err != nil {
		v.fail(w, r, err)
		return
	}
	WriteJSON(w, http.StatusOK, toWireSet(cs))
}

func (v syncHandlers) push(w http.ResponseWriter, r *http.Request) {
	id, ok := v.user(w, r)
	if !ok {
		return
	}
	r.Body = http.MaxBytesReader(w, r.Body, MaxPushBytes)
	var in wireSet
	if err := decodeStrict(r.Body, &in); err != nil {
		var tooBig *http.MaxBytesError
		if errors.As(err, &tooBig) {
			WriteProblem(w, http.StatusRequestEntityTooLarge, "request body too large (max 5 MB)")
			return
		}
		WriteProblem(w, http.StatusBadRequest, "invalid JSON: "+err.Error())
		return
	}
	res, err := v.svc.Push(r.Context(), id, in.toDomain())
	if err != nil {
		v.fail(w, r, err)
		return
	}
	WriteJSON(w, http.StatusOK, toWireResult(res))
}

// decodeStrict decodes exactly one JSON value, rejecting unknown fields and
// any data after it.
func decodeStrict(r io.Reader, v any) error {
	dec := json.NewDecoder(r)
	dec.DisallowUnknownFields()
	if err := dec.Decode(v); err != nil {
		return err
	}
	if _, err := dec.Token(); !errors.Is(err, io.EOF) {
		if err == nil {
			return errors.New("unexpected data after the JSON object")
		}
		return err
	}
	return nil
}

// fail maps use-case errors to problem responses.
func (v syncHandlers) fail(w http.ResponseWriter, r *http.Request, err error) {
	writeError(w, r, v.log, err)
}

type meResponse struct {
	UserID string `json:"userId"`
}

// Wire format: camelCase, timestamps as epoch milliseconds (matching the front).

type wireMeta struct {
	UpdatedAt *int64 `json:"updatedAt"`
	DeletedAt *int64 `json:"deletedAt"`
	Rev       int64  `json:"rev"`
}

type wireDocument struct {
	Kind string          `json:"kind"`
	Body json.RawMessage `json:"body"`
	wireMeta
}

type wireSession struct {
	ID   string          `json:"id"`
	Body json.RawMessage `json:"body"`
	wireMeta
}

type wireMeasurement struct {
	Date string          `json:"date"`
	Body json.RawMessage `json:"body"`
	wireMeta
}

type wireExerciseMeta struct {
	ExerciseID string          `json:"exerciseId"`
	Body       json.RawMessage `json:"body"`
	wireMeta
}

type wireSet struct {
	Documents    []wireDocument     `json:"documents"`
	Sessions     []wireSession      `json:"sessions"`
	Measurements []wireMeasurement  `json:"measurements"`
	ExerciseMeta []wireExerciseMeta `json:"exerciseMeta"`
	Cursor       *int64             `json:"cursor,omitempty"`
	HasMore      *bool              `json:"hasMore,omitempty"`
}

type wireItemResult struct {
	Key    string `json:"key"`
	Status string `json:"status"`
	Rev    int64  `json:"rev"`
}

type wireResult struct {
	Documents    []wireItemResult `json:"documents"`
	Sessions     []wireItemResult `json:"sessions"`
	Measurements []wireItemResult `json:"measurements"`
	ExerciseMeta []wireItemResult `json:"exerciseMeta"`
}

func msToTime(ms *int64) time.Time {
	if ms == nil {
		return time.Time{}
	}
	return time.UnixMilli(*ms).UTC()
}

func msToTimePtr(ms *int64) *time.Time {
	if ms == nil {
		return nil
	}
	t := time.UnixMilli(*ms).UTC()
	return &t
}

func timeToMs(t time.Time) *int64 {
	ms := t.UnixMilli()
	return &ms
}

func timePtrToMs(t *time.Time) *int64 {
	if t == nil {
		return nil
	}
	return timeToMs(*t)
}

func toMeta(updated time.Time, deleted *time.Time, rev int64) wireMeta {
	return wireMeta{UpdatedAt: timeToMs(updated), DeletedAt: timePtrToMs(deleted), Rev: rev}
}

func (in wireSet) toDomain() domain.ChangeSet {
	var cs domain.ChangeSet
	for _, d := range in.Documents {
		cs.Documents = append(cs.Documents, domain.Document{
			Kind: domain.DocumentKind(d.Kind), Body: d.Body,
			UpdatedAt: msToTime(d.UpdatedAt), DeletedAt: msToTimePtr(d.DeletedAt),
		})
	}
	for _, s := range in.Sessions {
		cs.Sessions = append(cs.Sessions, domain.Session{
			ID: s.ID, Body: s.Body, UpdatedAt: msToTime(s.UpdatedAt), DeletedAt: msToTimePtr(s.DeletedAt),
		})
	}
	for _, m := range in.Measurements {
		cs.Measurements = append(cs.Measurements, domain.Measurement{
			Date: m.Date, Body: m.Body, UpdatedAt: msToTime(m.UpdatedAt), DeletedAt: msToTimePtr(m.DeletedAt),
		})
	}
	for _, e := range in.ExerciseMeta {
		cs.ExerciseMeta = append(cs.ExerciseMeta, domain.ExerciseMeta{
			ExerciseID: e.ExerciseID, Body: e.Body, UpdatedAt: msToTime(e.UpdatedAt), DeletedAt: msToTimePtr(e.DeletedAt),
		})
	}
	return cs
}

func toWireSet(cs domain.ChangeSet) wireSet {
	out := wireSet{
		Documents:    make([]wireDocument, 0, len(cs.Documents)),
		Sessions:     make([]wireSession, 0, len(cs.Sessions)),
		Measurements: make([]wireMeasurement, 0, len(cs.Measurements)),
		ExerciseMeta: make([]wireExerciseMeta, 0, len(cs.ExerciseMeta)),
		Cursor:       &cs.Cursor,
		HasMore:      &cs.HasMore,
	}
	for _, d := range cs.Documents {
		out.Documents = append(out.Documents, wireDocument{Kind: string(d.Kind), Body: d.Body, wireMeta: toMeta(d.UpdatedAt, d.DeletedAt, d.Rev)})
	}
	for _, s := range cs.Sessions {
		out.Sessions = append(out.Sessions, wireSession{ID: s.ID, Body: s.Body, wireMeta: toMeta(s.UpdatedAt, s.DeletedAt, s.Rev)})
	}
	for _, m := range cs.Measurements {
		out.Measurements = append(out.Measurements, wireMeasurement{Date: m.Date, Body: m.Body, wireMeta: toMeta(m.UpdatedAt, m.DeletedAt, m.Rev)})
	}
	for _, e := range cs.ExerciseMeta {
		out.ExerciseMeta = append(out.ExerciseMeta, wireExerciseMeta{ExerciseID: e.ExerciseID, Body: e.Body, wireMeta: toMeta(e.UpdatedAt, e.DeletedAt, e.Rev)})
	}
	return out
}

func toWireItems(items []domain.ItemResult) []wireItemResult {
	out := make([]wireItemResult, 0, len(items))
	for _, it := range items {
		out = append(out, wireItemResult{Key: it.Key, Status: string(it.Status), Rev: it.Rev})
	}
	return out
}

func toWireResult(r domain.PushResult) wireResult {
	return wireResult{
		Documents:    toWireItems(r.Documents),
		Sessions:     toWireItems(r.Sessions),
		Measurements: toWireItems(r.Measurements),
		ExerciseMeta: toWireItems(r.ExerciseMeta),
	}
}
