// Package sync is the application use case for offline-first sync: clients push
// changed records (last write wins per record) and pull everything whose server
// rev is greater than their cursor.
package sync

import (
	"context"
	"fmt"
	"slices"
	"time"

	"github.com/John-Santa/fitplan/api/internal/domain/shared"
	domain "github.com/John-Santa/fitplan/api/internal/domain/sync"
	"github.com/John-Santa/fitplan/api/internal/port"
)

const (
	// DefaultPullLimit is used when the client does not ask for a page size.
	DefaultPullLimit = 200
	// MaxPullLimit caps the records returned by one pull.
	MaxPullLimit = 500
	// MaxClockSkew is how far ahead of the server clock a pushed updatedAt or
	// deletedAt may be; later values are clamped to now+MaxClockSkew so a wrong
	// client clock cannot pin a record under last-write-wins.
	MaxClockSkew = 10 * time.Minute
)

// ChangeReader reads the changes of one user. Changes returns, for each
// collection, up to limit records of userID with Rev > since, ordered by Rev,
// tombstones included. Cursor and HasMore are left for the caller to compute.
type ChangeReader interface {
	Changes(ctx context.Context, userID shared.UserID, since int64, limit int) (domain.ChangeSet, error)
}

// ChangeApplier writes a validated set atomically with last-write-wins per
// record, creating the user on first use.
type ChangeApplier interface {
	Apply(ctx context.Context, userID shared.UserID, cs domain.ChangeSet) (domain.PushResult, error)
}

// Deps are the collaborators of Service.
type Deps struct {
	Reader ChangeReader
	Writer ChangeApplier
	// Clock is the server clock used to clamp future timestamps; nil means
	// port.SystemClock.
	Clock port.Clock
}

// Service implements pull and push.
type Service struct {
	reader ChangeReader
	writer ChangeApplier
	clock  port.Clock
}

// NewService builds a Service.
func NewService(d Deps) *Service {
	clock := d.Clock
	if clock == nil {
		clock = port.SystemClock
	}
	return &Service{reader: d.Reader, writer: d.Writer, clock: clock}
}

func invalid(field, format string, args ...any) error {
	return fmt.Errorf("%w: %w", port.ErrInvalid, shared.Invalid(field, format, args...))
}

// Pull returns up to limit records of userID with rev > since, across all
// collections, ordered by rev. Cursor is the rev to pass as since next time;
// HasMore is true when more records are waiting.
func (s *Service) Pull(ctx context.Context, userID shared.UserID, since int64, limit int) (domain.ChangeSet, error) {
	if userID == "" {
		return domain.ChangeSet{}, fmt.Errorf("sync pull: %w", port.ErrUnauthorized)
	}
	if since < 0 {
		return domain.ChangeSet{}, invalid("since", "must be a non-negative integer")
	}
	if limit < 1 || limit > MaxPullLimit {
		return domain.ChangeSet{}, invalid("limit", "must be between 1 and %d", MaxPullLimit)
	}
	raw, err := s.reader.Changes(ctx, userID, since, limit+1)
	if err != nil {
		return domain.ChangeSet{}, fmt.Errorf("sync pull: %w", err)
	}
	return paginate(raw, since, limit), nil
}

// Push validates the whole set before writing anything, then applies it.
func (s *Service) Push(ctx context.Context, userID shared.UserID, cs domain.ChangeSet) (domain.PushResult, error) {
	if userID == "" {
		return domain.PushResult{}, fmt.Errorf("sync push: %w", port.ErrUnauthorized)
	}
	if err := cs.Validate(); err != nil {
		return domain.PushResult{}, fmt.Errorf("%w: %w", port.ErrInvalid, err)
	}
	cs.ClampFuture(s.clock.Now().Add(MaxClockSkew))
	res, err := s.writer.Apply(ctx, userID, cs)
	if err != nil {
		return domain.PushResult{}, fmt.Errorf("sync push: %w", err)
	}
	return res, nil
}

// paginate keeps the first limit records by rev across all collections.
// The store returned up to limit+1 per collection ordered by rev, so the global
// first limit records are always present. Revs are globally unique, so keeping
// rev <= cutoff yields exactly limit records.
func paginate(raw domain.ChangeSet, since int64, limit int) domain.ChangeSet {
	revs := make([]int64, 0, raw.Len())
	for _, d := range raw.Documents {
		revs = append(revs, d.Rev)
	}
	for _, x := range raw.Sessions {
		revs = append(revs, x.Rev)
	}
	for _, m := range raw.Measurements {
		revs = append(revs, m.Rev)
	}
	for _, e := range raw.ExerciseMeta {
		revs = append(revs, e.Rev)
	}
	slices.Sort(revs)

	out := domain.ChangeSet{Cursor: since}
	if len(revs) == 0 {
		return out
	}
	cutoff := revs[len(revs)-1]
	if len(revs) > limit {
		cutoff = revs[limit-1]
		out.HasMore = true
	}
	out.Cursor = cutoff
	out.Documents = keep(raw.Documents, cutoff, func(d domain.Document) int64 { return d.Rev })
	out.Sessions = keep(raw.Sessions, cutoff, func(x domain.Session) int64 { return x.Rev })
	out.Measurements = keep(raw.Measurements, cutoff, func(m domain.Measurement) int64 { return m.Rev })
	out.ExerciseMeta = keep(raw.ExerciseMeta, cutoff, func(e domain.ExerciseMeta) int64 { return e.Rev })
	return out
}

func keep[T any](items []T, cutoff int64, rev func(T) int64) []T {
	var out []T
	for _, it := range items {
		if rev(it) <= cutoff {
			out = append(out, it)
		}
	}
	return out
}
