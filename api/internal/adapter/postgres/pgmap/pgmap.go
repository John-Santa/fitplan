// Package pgmap maps sqlc rows to domain records and domain values to pgtype
// parameters. It holds no SQL and no transaction logic.
package pgmap

import (
	"fmt"
	"time"

	"github.com/jackc/pgx/v5/pgtype"

	"github.com/John-Santa/fitplan/api/internal/adapter/postgres/sqlcgen"
	domain "github.com/John-Santa/fitplan/api/internal/domain/sync"
)

// Document maps a user_documents row.
func Document(d sqlcgen.UserDocument) domain.Document {
	return domain.Document{
		Kind: domain.DocumentKind(d.Kind), Body: d.Body, Rev: d.Rev,
		UpdatedAt: d.UpdatedAt.Time.UTC(), DeletedAt: FromTs(d.DeletedAt),
	}
}

// Session maps a sessions row.
func Session(s sqlcgen.Session) domain.Session {
	return domain.Session{
		ID: s.ID, Kind: domain.SessionKind(s.Kind), Date: s.Date.Time.Format(domain.DateLayout),
		FinishedAt: FromTs(s.FinishedAt), Body: s.Body, Rev: s.Rev,
		UpdatedAt: s.UpdatedAt.Time.UTC(), DeletedAt: FromTs(s.DeletedAt),
	}
}

// Measurement maps a measurements row.
func Measurement(m sqlcgen.Measurement) domain.Measurement {
	return domain.Measurement{
		Date: m.Date.Time.Format(domain.DateLayout), Body: m.Body, Rev: m.Rev,
		UpdatedAt: m.UpdatedAt.Time.UTC(), DeletedAt: FromTs(m.DeletedAt),
	}
}

// ExerciseMeta maps an exercise_meta row.
func ExerciseMeta(e sqlcgen.ExerciseMetum) domain.ExerciseMeta {
	return domain.ExerciseMeta{
		ExerciseID: e.ExerciseID, Body: e.Body, Rev: e.Rev,
		UpdatedAt: e.UpdatedAt.Time.UTC(), DeletedAt: FromTs(e.DeletedAt),
	}
}

// ToTs maps an optional time; nil becomes SQL NULL.
func ToTs(t *time.Time) pgtype.Timestamptz {
	if t == nil {
		return pgtype.Timestamptz{}
	}
	return pgtype.Timestamptz{Time: *t, Valid: true}
}

// FromTs maps a nullable timestamptz to UTC.
func FromTs(ts pgtype.Timestamptz) *time.Time {
	if !ts.Valid {
		return nil
	}
	t := ts.Time.UTC()
	return &t
}

// ToDate maps a YYYY-MM-DD local day.
func ToDate(s string) (pgtype.Date, error) {
	t, err := time.Parse(domain.DateLayout, s)
	if err != nil {
		return pgtype.Date{}, fmt.Errorf("invalid date %q: %w", s, err)
	}
	return pgtype.Date{Time: t, Valid: true}, nil
}
