// Package store is the Postgres adapter of the domain.Store port.
package store

import (
	"context"
	"errors"
	"fmt"
	"io/fs"
	"time"

	"github.com/jackc/pgx/v5"
	"github.com/jackc/pgx/v5/pgtype"
	"github.com/jackc/pgx/v5/pgxpool"
	"github.com/jackc/pgx/v5/stdlib"
	"github.com/pressly/goose/v3"
	"github.com/pressly/goose/v3/lock"

	"github.com/John-Santa/fitplan/api/db"
	"github.com/John-Santa/fitplan/api/internal/domain"
	"github.com/John-Santa/fitplan/api/internal/store/sqlcgen"
)

// Open creates a connection pool with conservative limits and checks it.
func Open(ctx context.Context, url string) (*pgxpool.Pool, error) {
	cfg, err := pgxpool.ParseConfig(url)
	if err != nil {
		return nil, fmt.Errorf("store: parse database url: %w", err)
	}
	cfg.MaxConns = 10
	cfg.MinConns = 0
	cfg.MaxConnLifetime = 30 * time.Minute
	cfg.MaxConnIdleTime = 5 * time.Minute
	cfg.HealthCheckPeriod = time.Minute
	cfg.ConnConfig.ConnectTimeout = 5 * time.Second

	pool, err := pgxpool.NewWithConfig(ctx, cfg)
	if err != nil {
		return nil, fmt.Errorf("store: create pool: %w", err)
	}
	pingCtx, cancel := context.WithTimeout(ctx, 10*time.Second)
	defer cancel()
	if err := pool.Ping(pingCtx); err != nil {
		pool.Close()
		return nil, fmt.Errorf("store: ping: %w", err)
	}
	return pool, nil
}

// Migrate applies the embedded goose migrations that are still pending.
func Migrate(ctx context.Context, pool *pgxpool.Pool) error {
	fsys, err := fs.Sub(db.Migrations, "migrations")
	if err != nil {
		return fmt.Errorf("store: migrations fs: %w", err)
	}
	sqlDB := stdlib.OpenDBFromPool(pool)
	defer sqlDB.Close()
	// A session-level advisory lock makes concurrent boots migrate one at a time
	// (retry every second, give up after a minute).
	locker, err := lock.NewPostgresSessionLocker(lock.WithLockTimeout(1, 60))
	if err != nil {
		return fmt.Errorf("store: migration locker: %w", err)
	}
	p, err := goose.NewProvider(goose.DialectPostgres, sqlDB, fsys, goose.WithSessionLocker(locker))
	if err != nil {
		return fmt.Errorf("store: goose provider: %w", err)
	}
	if _, err := p.Up(ctx); err != nil {
		return fmt.Errorf("store: migrate up: %w", err)
	}
	return nil
}

// Postgres implements domain.Store with pgx and the sqlc-generated queries.
type Postgres struct {
	pool *pgxpool.Pool
}

// NewPostgres builds the adapter.
func NewPostgres(pool *pgxpool.Pool) *Postgres { return &Postgres{pool: pool} }

var _ domain.Store = (*Postgres)(nil)

// Changes reads all collections in one REPEATABLE READ snapshot so the
// cursor never skips a row committed between two of the queries.
func (p *Postgres) Changes(ctx context.Context, userID string, since int64, limit int) (cs domain.ChangeSet, err error) {
	tx, err := p.pool.BeginTx(ctx, pgx.TxOptions{IsoLevel: pgx.RepeatableRead, AccessMode: pgx.ReadOnly})
	if err != nil {
		return cs, fmt.Errorf("begin: %w", err)
	}
	defer func() { _ = tx.Rollback(ctx) }()
	q := sqlcgen.New(tx)
	lim := int32(limit)

	docs, err := q.ListUserDocumentsChangedSince(ctx, sqlcgen.ListUserDocumentsChangedSinceParams{UserID: userID, Rev: since, Limit: lim})
	if err != nil {
		return cs, fmt.Errorf("list documents: %w", err)
	}
	for _, d := range docs {
		cs.Documents = append(cs.Documents, domain.Document{
			Kind: domain.DocumentKind(d.Kind), Body: d.Body, Rev: d.Rev,
			UpdatedAt: d.UpdatedAt.Time.UTC(), DeletedAt: fromTs(d.DeletedAt),
		})
	}
	sessions, err := q.ListSessionsChangedSince(ctx, sqlcgen.ListSessionsChangedSinceParams{UserID: userID, Rev: since, Limit: lim})
	if err != nil {
		return cs, fmt.Errorf("list sessions: %w", err)
	}
	for _, s := range sessions {
		cs.Sessions = append(cs.Sessions, domain.Session{
			ID: s.ID, Kind: domain.SessionKind(s.Kind), Date: s.Date.Time.Format(domain.DateLayout),
			FinishedAt: fromTs(s.FinishedAt), Body: s.Body, Rev: s.Rev,
			UpdatedAt: s.UpdatedAt.Time.UTC(), DeletedAt: fromTs(s.DeletedAt),
		})
	}
	meas, err := q.ListMeasurementsChangedSince(ctx, sqlcgen.ListMeasurementsChangedSinceParams{UserID: userID, Rev: since, Limit: lim})
	if err != nil {
		return cs, fmt.Errorf("list measurements: %w", err)
	}
	for _, m := range meas {
		cs.Measurements = append(cs.Measurements, domain.Measurement{
			Date: m.Date.Time.Format(domain.DateLayout), Body: m.Body, Rev: m.Rev,
			UpdatedAt: m.UpdatedAt.Time.UTC(), DeletedAt: fromTs(m.DeletedAt),
		})
	}
	metas, err := q.ListExerciseMetaChangedSince(ctx, sqlcgen.ListExerciseMetaChangedSinceParams{UserID: userID, Rev: since, Limit: lim})
	if err != nil {
		return cs, fmt.Errorf("list exercise meta: %w", err)
	}
	for _, e := range metas {
		cs.ExerciseMeta = append(cs.ExerciseMeta, domain.ExerciseMeta{
			ExerciseID: e.ExerciseID, Body: e.Body, Rev: e.Rev,
			UpdatedAt: e.UpdatedAt.Time.UTC(), DeletedAt: fromTs(e.DeletedAt),
		})
	}
	return cs, nil
}

// Apply writes the set in one transaction. A per-user advisory lock
// serializes pushes of the same user, so revs of one user commit in order and
// a pull cursor can never pass a rev that is still uncommitted.
func (p *Postgres) Apply(ctx context.Context, userID string, cs domain.ChangeSet) (res domain.PushResult, err error) {
	tx, err := p.pool.Begin(ctx)
	if err != nil {
		return res, fmt.Errorf("begin: %w", err)
	}
	defer func() { _ = tx.Rollback(ctx) }()

	if _, err := tx.Exec(ctx, `SELECT pg_advisory_xact_lock(hashtextextended($1, 0))`, userID); err != nil {
		return res, fmt.Errorf("lock user: %w", err)
	}
	q := sqlcgen.New(tx)
	if err := q.UpsertUser(ctx, userID); err != nil {
		return res, fmt.Errorf("upsert user: %w", err)
	}

	for _, d := range cs.Documents {
		rev, err := q.UpsertUserDocument(ctx, sqlcgen.UpsertUserDocumentParams{
			UserID: userID, Kind: string(d.Kind), Body: d.Body, UpdatedAt: toTs(&d.UpdatedAt), DeletedAt: toTs(d.DeletedAt),
		})
		r, err := result(string(d.Kind), rev, err)
		if err != nil {
			return res, fmt.Errorf("upsert document %s: %w", d.Kind, err)
		}
		res.Documents = append(res.Documents, r)
	}
	for _, s := range cs.Sessions {
		date, err := toDate(s.Date)
		if err != nil {
			return res, err
		}
		rev, err := q.UpsertSession(ctx, sqlcgen.UpsertSessionParams{
			UserID: userID, ID: s.ID, Kind: string(s.Kind), Date: date, FinishedAt: toTs(s.FinishedAt),
			Body: s.Body, UpdatedAt: toTs(&s.UpdatedAt), DeletedAt: toTs(s.DeletedAt),
		})
		r, err := result(s.ID, rev, err)
		if err != nil {
			return res, fmt.Errorf("upsert session: %w", err)
		}
		res.Sessions = append(res.Sessions, r)
	}
	for _, m := range cs.Measurements {
		date, err := toDate(m.Date)
		if err != nil {
			return res, err
		}
		rev, err := q.UpsertMeasurement(ctx, sqlcgen.UpsertMeasurementParams{
			UserID: userID, Date: date, Body: m.Body, UpdatedAt: toTs(&m.UpdatedAt), DeletedAt: toTs(m.DeletedAt),
		})
		r, err := result(m.Date, rev, err)
		if err != nil {
			return res, fmt.Errorf("upsert measurement: %w", err)
		}
		res.Measurements = append(res.Measurements, r)
	}
	for _, e := range cs.ExerciseMeta {
		rev, err := q.UpsertExerciseMeta(ctx, sqlcgen.UpsertExerciseMetaParams{
			UserID: userID, ExerciseID: e.ExerciseID, Body: e.Body, UpdatedAt: toTs(&e.UpdatedAt), DeletedAt: toTs(e.DeletedAt),
		})
		r, err := result(e.ExerciseID, rev, err)
		if err != nil {
			return res, fmt.Errorf("upsert exercise meta: %w", err)
		}
		res.ExerciseMeta = append(res.ExerciseMeta, r)
	}

	if err := tx.Commit(ctx); err != nil {
		return domain.PushResult{}, fmt.Errorf("commit: %w", err)
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

func toTs(t *time.Time) pgtype.Timestamptz {
	if t == nil {
		return pgtype.Timestamptz{}
	}
	return pgtype.Timestamptz{Time: *t, Valid: true}
}

func fromTs(ts pgtype.Timestamptz) *time.Time {
	if !ts.Valid {
		return nil
	}
	t := ts.Time.UTC()
	return &t
}

func toDate(s string) (pgtype.Date, error) {
	t, err := time.Parse(domain.DateLayout, s)
	if err != nil {
		return pgtype.Date{}, fmt.Errorf("invalid date %q: %w", s, err)
	}
	return pgtype.Date{Time: t, Valid: true}, nil
}
