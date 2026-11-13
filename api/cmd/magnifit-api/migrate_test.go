package main

import (
	"context"
	"errors"
	"os"
	"testing"
	"time"

	"github.com/jackc/pgx/v5/pgxpool"

	"github.com/John-Santa/fitplan/api/internal/adapter/postgres"
	"github.com/John-Santa/fitplan/api/internal/platform/postgresdb"
)

const (
	appURL   = "postgres://app@localhost/db"
	ownerURL = "postgres://owner@localhost/db"
)

// lazyPool returns a pool that does not connect until used, so the wiring can
// be tested without a database.
func lazyPool(t *testing.T, url string) *pgxpool.Pool {
	t.Helper()
	pool, err := pgxpool.New(context.Background(), url)
	if err != nil {
		t.Fatalf("pgxpool.New(%q): %v", url, err)
	}
	t.Cleanup(pool.Close)
	return pool
}

func assertClosed(t *testing.T, pool *pgxpool.Pool) {
	t.Helper()
	if err := pool.Ping(context.Background()); err == nil || err.Error() != "closed pool" {
		t.Errorf("Ping error = %v, want closed pool", err)
	}
}

func TestMigrateOnBootWithoutMigrationURLUsesServingPool(t *testing.T) {
	serving := lazyPool(t, appURL)
	open := func(_ context.Context, url string) (*pgxpool.Pool, error) {
		t.Errorf("open(%q) called; no extra connection expected", url)
		return nil, errors.New("unexpected open")
	}
	var migratedWith *pgxpool.Pool
	migrate := func(_ context.Context, p *pgxpool.Pool) error {
		migratedWith = p
		return nil
	}

	if err := migrateOnBoot(context.Background(), "", serving, open, migrate); err != nil {
		t.Fatalf("migrateOnBoot: %v", err)
	}
	if migratedWith != serving {
		t.Error("migrations ran on a pool other than the serving pool")
	}
}

func TestMigrateOnBootWithMigrationURLUsesDedicatedPoolAndClosesIt(t *testing.T) {
	serving := lazyPool(t, appURL)
	owner := lazyPool(t, ownerURL)
	var opened []string
	open := func(_ context.Context, url string) (*pgxpool.Pool, error) {
		opened = append(opened, url)
		return owner, nil
	}
	var migratedWith *pgxpool.Pool
	migrate := func(_ context.Context, p *pgxpool.Pool) error {
		migratedWith = p
		return nil
	}

	if err := migrateOnBoot(context.Background(), ownerURL, serving, open, migrate); err != nil {
		t.Fatalf("migrateOnBoot: %v", err)
	}
	if len(opened) != 1 || opened[0] != ownerURL {
		t.Errorf("opened %v, want exactly the migration URL", opened)
	}
	if migratedWith != owner {
		t.Error("migrations did not run on the migration pool")
	}
	assertClosed(t, owner)
	pingCtx, cancel := context.WithTimeout(context.Background(), 50*time.Millisecond)
	defer cancel()
	if err := serving.Ping(pingCtx); err != nil && err.Error() == "closed pool" {
		t.Error("serving pool was closed by the migration step")
	}
}

func TestMigrateOnBootClosesMigrationPoolOnFailureAndWrapsError(t *testing.T) {
	serving := lazyPool(t, appURL)
	owner := lazyPool(t, ownerURL)
	open := func(context.Context, string) (*pgxpool.Pool, error) { return owner, nil }
	boom := errors.New("boom")
	migrate := func(context.Context, *pgxpool.Pool) error { return boom }

	err := migrateOnBoot(context.Background(), ownerURL, serving, open, migrate)
	if !errors.Is(err, boom) {
		t.Fatalf("err = %v, want it to wrap the migrate error", err)
	}
	assertClosed(t, owner)
}

func TestMigrateOnBootReportsMigrationPoolOpenFailure(t *testing.T) {
	serving := lazyPool(t, appURL)
	boom := errors.New("dial failed")
	open := func(context.Context, string) (*pgxpool.Pool, error) { return nil, boom }
	migrate := func(context.Context, *pgxpool.Pool) error {
		t.Error("migrate must not run when the migration pool cannot open")
		return nil
	}

	err := migrateOnBoot(context.Background(), ownerURL, serving, open, migrate)
	if !errors.Is(err, boom) {
		t.Fatalf("err = %v, want it to wrap the open error", err)
	}
}

// TestMigrateOnBootAppliesMigrationsOnPostgres runs the real migrator, advisory
// lock included, on the serving pool and on a dedicated migration connection.
// It skips without TEST_DATABASE_URL.
func TestMigrateOnBootAppliesMigrationsOnPostgres(t *testing.T) {
	url := os.Getenv("TEST_DATABASE_URL")
	if url == "" {
		t.Skip("TEST_DATABASE_URL not set; skipping Postgres integration test")
	}
	ctx := context.Background()
	serving, err := postgresdb.Open(ctx, url)
	if err != nil {
		t.Fatalf("open serving pool: %v", err)
	}
	t.Cleanup(serving.Close)

	for name, migrationURL := range map[string]string{"serving pool": "", "dedicated pool": url} {
		t.Run(name, func(t *testing.T) {
			if err := migrateOnBoot(ctx, migrationURL, serving, postgresdb.Open, postgres.Migrate); err != nil {
				t.Fatalf("migrateOnBoot: %v", err)
			}
			var found bool
			if err := serving.QueryRow(ctx, `SELECT to_regclass('public.users') IS NOT NULL`).Scan(&found); err != nil || !found {
				t.Fatalf("users table present = %v, err = %v", found, err)
			}
			if err := serving.Ping(ctx); err != nil {
				t.Errorf("serving pool unusable after migrating: %v", err)
			}
		})
	}
}
