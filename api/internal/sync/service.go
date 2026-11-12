// Package sync is the application service for offline-first sync: clients push
// changed records (last write wins per record) and pull everything whose server
// rev is greater than their cursor.
package sync

import (
	"context"
	"errors"
	"fmt"
	"slices"

	"github.com/John-Santa/fitplan/api/internal/domain"
)

const (
	// DefaultPullLimit is used when the client does not ask for a page size.
	DefaultPullLimit = 200
	// MaxPullLimit caps the records returned by one pull.
	MaxPullLimit = 500
)

// ErrNoUser is returned when the caller has no authenticated user id.
var ErrNoUser = errors.New("sync: missing user id")

// Service implements pull and push on top of a domain.Store.
type Service struct {
	store domain.Store
}

// NewService builds a Service.
func NewService(store domain.Store) *Service { return &Service{store: store} }

// Pull returns up to limit records of userID with rev > since, across all
// collections, ordered by rev. Cursor is the rev to pass as since next time;
// HasMore is true when more records are waiting.
func (s *Service) Pull(ctx context.Context, userID string, since int64, limit int) (domain.ChangeSet, error) {
	if userID == "" {
		return domain.ChangeSet{}, ErrNoUser
	}
	if since < 0 {
		return domain.ChangeSet{}, &domain.ValidationError{Field: "since", Msg: "must be a non-negative integer"}
	}
	if limit < 1 || limit > MaxPullLimit {
		return domain.ChangeSet{}, &domain.ValidationError{Field: "limit", Msg: fmt.Sprintf("must be between 1 and %d", MaxPullLimit)}
	}
	raw, err := s.store.Changes(ctx, userID, since, limit+1)
	if err != nil {
		return domain.ChangeSet{}, fmt.Errorf("sync pull: %w", err)
	}
	return paginate(raw, since, limit), nil
}

// Push validates the whole set before writing anything, then applies it.
func (s *Service) Push(ctx context.Context, userID string, cs domain.ChangeSet) (domain.PushResult, error) {
	if userID == "" {
		return domain.PushResult{}, ErrNoUser
	}
	if err := cs.Validate(); err != nil {
		return domain.PushResult{}, err
	}
	res, err := s.store.Apply(ctx, userID, cs)
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
