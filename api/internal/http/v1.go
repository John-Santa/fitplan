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

	"github.com/John-Santa/fitplan/api/internal/domain"
)

// MaxPushBytes caps the body of POST /v1/sync.
const MaxPushBytes = 5 << 20

const (
	defaultPullLimit = 200
	maxPullLimit     = 500
)

// SyncService is the application port the sync routes depend on.
type SyncService interface {
	Pull(ctx context.Context, userID string, since int64, limit int) (domain.ChangeSet, error)
	Push(ctx context.Context, userID string, cs domain.ChangeSet) (domain.PushResult, error)
}

// V1 holds the dependencies of the authenticated /v1 routes.
type V1 struct {
	// Auth wraps every /v1 route; unauthenticated requests never reach them.
	Auth func(http.Handler) http.Handler
	// UserID reads the authenticated user id that Auth put in the context.
	UserID func(ctx context.Context) (string, bool)
	Sync   SyncService
	Logger *slog.Logger
}

// Register adds the /v1 routes to mux; use it as Options.Extra.
func (v V1) Register(mux *http.ServeMux) {
	mux.Handle("GET /v1/me", v.Auth(http.HandlerFunc(v.me)))
	mux.Handle("GET /v1/sync", v.Auth(http.HandlerFunc(v.pull)))
	mux.Handle("POST /v1/sync", v.Auth(http.HandlerFunc(v.push)))
}

func (v V1) user(w http.ResponseWriter, r *http.Request) (string, bool) {
	id, ok := v.UserID(r.Context())
	if !ok {
		WriteError(w, http.StatusUnauthorized, "unauthorized")
	}
	return id, ok
}

func (v V1) me(w http.ResponseWriter, r *http.Request) {
	id, ok := v.user(w, r)
	if !ok {
		return
	}
	WriteJSON(w, http.StatusOK, map[string]string{"userId": id})
}

func (v V1) pull(w http.ResponseWriter, r *http.Request) {
	id, ok := v.user(w, r)
	if !ok {
		return
	}
	q := r.URL.Query()
	since := int64(0)
	if raw := q.Get("since"); raw != "" {
		n, err := strconv.ParseInt(raw, 10, 64)
		if err != nil || n < 0 {
			WriteError(w, http.StatusBadRequest, "since: must be a non-negative integer")
			return
		}
		since = n
	}
	limit := defaultPullLimit
	if raw := q.Get("limit"); raw != "" {
		n, err := strconv.Atoi(raw)
		if err != nil || n < 1 || n > maxPullLimit {
			WriteError(w, http.StatusBadRequest, "limit: must be an integer between 1 and "+strconv.Itoa(maxPullLimit))
			return
		}
		limit = n
	}
	cs, err := v.Sync.Pull(r.Context(), id, since, limit)
	if err != nil {
		v.fail(w, r, err)
		return
	}
	WriteJSON(w, http.StatusOK, toWireSet(cs))
}

func (v V1) push(w http.ResponseWriter, r *http.Request) {
	id, ok := v.user(w, r)
	if !ok {
		return
	}
	r.Body = http.MaxBytesReader(w, r.Body, MaxPushBytes)
	var in wireSet
	if err := decodeStrict(r.Body, &in); err != nil {
		var tooBig *http.MaxBytesError
		if errors.As(err, &tooBig) {
			WriteError(w, http.StatusRequestEntityTooLarge, "request body too large (max 5 MB)")
			return
		}
		WriteError(w, http.StatusBadRequest, "invalid JSON: "+err.Error())
		return
	}
	res, err := v.Sync.Push(r.Context(), id, in.toDomain())
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

// fail maps service errors: validation → 400, anything else → logged 500.
func (v V1) fail(w http.ResponseWriter, r *http.Request, err error) {
	var verr *domain.ValidationError
	if errors.As(err, &verr) {
		WriteError(w, http.StatusBadRequest, verr.Error())
		return
	}
	log := v.Logger
	if log == nil {
		log = slog.Default()
	}
	log.LogAttrs(r.Context(), slog.LevelError, "sync failed",
		slog.String("request_id", r.Header.Get(requestIDHeader)),
		slog.Any("error", err),
	)
	WriteError(w, http.StatusInternalServerError, "internal server error")
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
