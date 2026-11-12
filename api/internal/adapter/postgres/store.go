// Package postgres is the Postgres adapter of the sync use case: pgx with the
// sqlc-generated queries, row mapping in pgmap, and goose migrations.
package postgres

import (
	"context"
	"errors"
	"fmt"

	"github.com/jackc/pgx/v5"
	"github.com/jackc/pgx/v5/pgxpool"

	"github.com/John-Santa/fitplan/api/internal/adapter/postgres/pgmap"
	"github.com/John-Santa/fitplan/api/internal/adapter/postgres/sqlcgen"
	"github.com/John-Santa/fitplan/api/internal/domain/shared"
	domain "github.com/John-Santa/fitplan/api/internal/domain/sync"
	"github.com/John-Santa/fitplan/api/internal/platform/postgresdb"
	syncuc "github.com/John-Santa/fitplan/api/internal/usecase/sync"
)

// SyncStore implements the sync use case's ChangeReader and ChangeApplier.
type SyncStore struct {
	pool *pgxpool.Pool
}

// NewSyncStore builds the adapter.
func NewSyncStore(pool *pgxpool.Pool) *SyncStore { return &SyncStore{pool: pool} }

var (
	_ syncuc.ChangeReader  = (*SyncStore)(nil)
	_ syncuc.ChangeApplier = (*SyncStore)(nil)
)

// Changes reads all collections in one REPEATABLE READ snapshot so the
// cursor never skips a row committed between two of the queries.
func (s *SyncStore) Changes(ctx context.Context, userID shared.UserID, since int64, limit int) (domain.ChangeSet, error) {
	var cs domain.ChangeSet
	err := postgresdb.WithTx(ctx, s.pool, pgx.TxOptions{IsoLevel: pgx.RepeatableRead, AccessMode: pgx.ReadOnly}, func(tx pgx.Tx) error {
		q := sqlcgen.New(tx)
		uid, lim := string(userID), int32(limit) //nolint:gosec // limit is capped by the use case (≤ MaxPullLimit+1)

		docs, err := q.ListUserDocumentsChangedSince(ctx, sqlcgen.ListUserDocumentsChangedSinceParams{UserID: uid, Rev: since, Limit: lim})
		if err != nil {
			return fmt.Errorf("list documents: %w", err)
		}
		for _, d := range docs {
			cs.Documents = append(cs.Documents, pgmap.Document(d))
		}
		sessions, err := q.ListSessionsChangedSince(ctx, sqlcgen.ListSessionsChangedSinceParams{UserID: uid, Rev: since, Limit: lim})
		if err != nil {
			return fmt.Errorf("list sessions: %w", err)
		}
		for _, x := range sessions {
			cs.Sessions = append(cs.Sessions, pgmap.Session(x))
		}
		meas, err := q.ListMeasurementsChangedSince(ctx, sqlcgen.ListMeasurementsChangedSinceParams{UserID: uid, Rev: since, Limit: lim})
		if err != nil {
			return fmt.Errorf("list measurements: %w", err)
		}
		for _, m := range meas {
			cs.Measurements = append(cs.Measurements, pgmap.Measurement(m))
		}
		metas, err := q.ListExerciseMetaChangedSince(ctx, sqlcgen.ListExerciseMetaChangedSinceParams{UserID: uid, Rev: since, Limit: lim})
		if err != nil {
			return fmt.Errorf("list exercise meta: %w", err)
		}
		for _, e := range metas {
			cs.ExerciseMeta = append(cs.ExerciseMeta, pgmap.ExerciseMeta(e))
		}
		return nil
	})
	if err != nil {
		return domain.ChangeSet{}, err
	}
	return cs, nil
}

// Apply writes the set in one transaction. A per-user advisory lock
// serializes pushes of the same user, so revs of one user commit in order and
// a pull cursor can never pass a rev that is still uncommitted.
func (s *SyncStore) Apply(ctx context.Context, userID shared.UserID, cs domain.ChangeSet) (domain.PushResult, error) {
	var res domain.PushResult
	err := postgresdb.WithTx(ctx, s.pool, pgx.TxOptions{}, func(tx pgx.Tx) error {
		uid := string(userID)
		if _, err := tx.Exec(ctx, `SELECT pg_advisory_xact_lock(hashtextextended($1, 0))`, uid); err != nil {
			return fmt.Errorf("lock user: %w", err)
		}
		q := sqlcgen.New(tx)
		if err := q.UpsertUser(ctx, uid); err != nil {
			return fmt.Errorf("upsert user: %w", err)
		}
		for _, d := range cs.Documents {
			rev, err := q.UpsertUserDocument(ctx, sqlcgen.UpsertUserDocumentParams{
				UserID: uid, Kind: string(d.Kind), Body: d.Body, UpdatedAt: pgmap.ToTs(&d.UpdatedAt), DeletedAt: pgmap.ToTs(d.DeletedAt),
			})
			r, err := result(string(d.Kind), rev, err)
			if err != nil {
				return fmt.Errorf("upsert document %s: %w", d.Kind, err)
			}
			res.Documents = append(res.Documents, r)
		}
		for _, x := range cs.Sessions {
			date, err := pgmap.ToDate(x.Date)
			if err != nil {
				return err
			}
			rev, err := q.UpsertSession(ctx, sqlcgen.UpsertSessionParams{
				UserID: uid, ID: x.ID, Kind: string(x.Kind), Date: date, FinishedAt: pgmap.ToTs(x.FinishedAt),
				Body: x.Body, UpdatedAt: pgmap.ToTs(&x.UpdatedAt), DeletedAt: pgmap.ToTs(x.DeletedAt),
			})
			r, err := result(x.ID, rev, err)
			if err != nil {
				return fmt.Errorf("upsert session: %w", err)
			}
			res.Sessions = append(res.Sessions, r)
		}
		for _, m := range cs.Measurements {
			date, err := pgmap.ToDate(m.Date)
			if err != nil {
				return err
			}
			rev, err := q.UpsertMeasurement(ctx, sqlcgen.UpsertMeasurementParams{
				UserID: uid, Date: date, Body: m.Body, UpdatedAt: pgmap.ToTs(&m.UpdatedAt), DeletedAt: pgmap.ToTs(m.DeletedAt),
			})
			r, err := result(m.Date, rev, err)
			if err != nil {
				return fmt.Errorf("upsert measurement: %w", err)
			}
			res.Measurements = append(res.Measurements, r)
		}
		for _, e := range cs.ExerciseMeta {
			rev, err := q.UpsertExerciseMeta(ctx, sqlcgen.UpsertExerciseMetaParams{
				UserID: uid, ExerciseID: e.ExerciseID, Body: e.Body, UpdatedAt: pgmap.ToTs(&e.UpdatedAt), DeletedAt: pgmap.ToTs(e.DeletedAt),
			})
			r, err := result(e.ExerciseID, rev, err)
			if err != nil {
				return fmt.Errorf("upsert exercise meta: %w", err)
			}
			res.ExerciseMeta = append(res.ExerciseMeta, r)
		}
		return nil
	})
	if err != nil {
		return domain.PushResult{}, err
	}
	return res, nil
}

// result maps the LWW upsert outcome: no returned row means the server copy is newer.
func result(key string, rev int64, err error) (domain.ItemResult, error) {
	if errors.Is(err, pgx.ErrNoRows) {
		return domain.ItemResult{Key: key, Status: domain.StatusStale}, nil
	}
	if err != nil {
		return domain.ItemResult{}, err
	}
	return domain.ItemResult{Key: key, Status: domain.StatusApplied, Rev: rev}, nil
}
