package postgres_test

import (
	"context"
	"errors"
	"testing"
	"time"

	"github.com/jackc/pgx/v5/pgxpool"

	"github.com/John-Santa/fitplan/api/internal/adapter/postgres"
	"github.com/John-Santa/fitplan/api/internal/domain/shared"
	"github.com/John-Santa/fitplan/api/internal/port"
	"github.com/John-Santa/fitplan/api/internal/usecase/account"
)

// noIdentity stands in for Clerk: the store is what these tests exercise.
type noIdentity struct{}

func (noIdentity) DeleteUser(context.Context, shared.UserID) error { return nil }

func newAccountService(pool *pgxpool.Pool) *account.Service {
	return account.NewService(account.Deps{Store: postgres.NewSyncStore(pool), Identity: noIdentity{}})
}

// rowsOf counts the rows of userID in every table that holds user data.
func rowsOf(t *testing.T, pool *pgxpool.Pool, userID string) map[string]int {
	t.Helper()
	out := map[string]int{}
	for _, table := range []string{"users", "user_documents", "sessions", "measurements", "exercise_meta"} {
		col := "user_id"
		if table == "users" {
			col = "id"
		}
		var n int
		if err := pool.QueryRow(context.Background(), `SELECT count(*) FROM `+table+` WHERE `+col+` = $1`, userID).Scan(&n); err != nil {
			t.Fatalf("count %s: %v", table, err)
		}
		out[table] = n
	}
	return out
}

func assertNoRows(t *testing.T, pool *pgxpool.Pool, userID string, keepUser bool) {
	t.Helper()
	for table, n := range rowsOf(t, pool, userID) {
		want := 0
		if table == "users" && keepUser {
			want = 1
		}
		if n != want {
			t.Errorf("%s has %d rows of %s, want %d", table, n, userID, want)
		}
	}
}

// Acceptance (S4): "Después del borrado, GET /v1/sync para ese usuario no
// devuelve nada y no quedan filas en ninguna tabla."
func TestDeleteAccountLeavesNoRowsAndLaterSyncIsGone(t *testing.T) {
	svc, pool := newService(t)
	ctx := context.Background()
	for _, u := range []shared.UserID{"user_a", "user_b"} {
		if _, err := svc.Push(ctx, u, fullSet(t0)); err != nil {
			t.Fatalf("push %s: %v", u, err)
		}
	}

	if err := newAccountService(pool).DeleteAccount(ctx, "user_a"); err != nil {
		t.Fatalf("DeleteAccount: %v", err)
	}

	assertNoRows(t, pool, "user_a", false)
	got, err := svc.Pull(ctx, "user_a", 0, 100)
	if !errors.Is(err, port.ErrGone) || got.Len() != 0 {
		t.Errorf("pull after delete = %d records, err %v; want nothing and ErrGone", got.Len(), err)
	}
	if _, err := svc.Push(ctx, "user_a", fullSet(t0.Add(time.Hour))); !errors.Is(err, port.ErrGone) {
		t.Errorf("push after delete err = %v, want ErrGone", err)
	}
	// The rejected push wrote nothing, not even the user row.
	assertNoRows(t, pool, "user_a", false)

	// Other users are untouched.
	other, err := svc.Pull(ctx, "user_b", 0, 100)
	if err != nil || other.Len() != 4 {
		t.Errorf("user_b pull = %d records, err %v; want 4", other.Len(), err)
	}
}

func TestDeleteAccountKeepsOnlyAHashOfTheUserID(t *testing.T) {
	_, pool := newService(t)
	ctx := context.Background()
	if err := newAccountService(pool).DeleteAccount(ctx, "user_a"); err != nil {
		t.Fatalf("DeleteAccount: %v", err)
	}
	var n int
	if err := pool.QueryRow(ctx, `SELECT count(*) FROM deleted_users`).Scan(&n); err != nil || n != 1 {
		t.Fatalf("deleted_users rows = %d (%v), want 1", n, err)
	}
	var raw int
	if err := pool.QueryRow(ctx, `SELECT count(*) FROM deleted_users WHERE position('user_a'::bytea in user_id_sha256) > 0`).Scan(&raw); err != nil || raw != 0 {
		t.Errorf("deleted_users stores the raw user id (%d, %v)", raw, err)
	}
}

func TestDeleteAccountIsIdempotent(t *testing.T) {
	svc, pool := newService(t)
	ctx := context.Background()
	if _, err := svc.Push(ctx, "user_a", fullSet(t0)); err != nil {
		t.Fatal(err)
	}
	acc := newAccountService(pool)
	for i := range 2 {
		if err := acc.DeleteAccount(ctx, "user_a"); err != nil {
			t.Fatalf("DeleteAccount #%d: %v", i+1, err)
		}
	}
	// A user who never synced can delete the account too.
	if err := acc.DeleteAccount(ctx, "user_new"); err != nil {
		t.Fatalf("DeleteAccount of a user without rows: %v", err)
	}
	if _, err := svc.Push(ctx, "user_new", fullSet(t0)); !errors.Is(err, port.ErrGone) {
		t.Errorf("push of a deleted user without rows err = %v, want ErrGone", err)
	}
	assertNoRows(t, pool, "user_new", false)
}

func TestDeleteDataKeepsTheAccount(t *testing.T) {
	svc, pool := newService(t)
	ctx := context.Background()
	for _, u := range []shared.UserID{"user_a", "user_b"} {
		if _, err := svc.Push(ctx, u, fullSet(t0)); err != nil {
			t.Fatalf("push %s: %v", u, err)
		}
	}

	if err := newAccountService(pool).DeleteData(ctx, "user_a"); err != nil {
		t.Fatalf("DeleteData: %v", err)
	}

	assertNoRows(t, pool, "user_a", true)
	got, err := svc.Pull(ctx, "user_a", 0, 100)
	if err != nil || got.Len() != 0 {
		t.Errorf("pull after data delete = %d records, err %v; want nothing and no error", got.Len(), err)
	}
	if other, err := svc.Pull(ctx, "user_b", 0, 100); err != nil || other.Len() != 4 {
		t.Errorf("user_b pull = %d records, err %v; want 4", other.Len(), err)
	}
	// The account keeps working: a later push is accepted.
	res, err := svc.Push(ctx, "user_a", fullSet(t0))
	if err != nil || len(res.Sessions) != 1 || res.Sessions[0].Status != "applied" {
		t.Errorf("push after data delete = %+v, %v; want applied", res, err)
	}
}

// Deletions take the per-user lock of the push, so they wait for a push of
// the same user that is still writing instead of interleaving with it.
func TestDeletionsWaitForTheUserLockOfThePush(t *testing.T) {
	for name, del := range map[string]func(*account.Service) error{
		"account": func(a *account.Service) error { return a.DeleteAccount(context.Background(), "user_a") },
		"data":    func(a *account.Service) error { return a.DeleteData(context.Background(), "user_a") },
	} {
		t.Run(name, func(t *testing.T) {
			_, pool := newService(t)
			ctx := context.Background()
			tx, err := pool.Begin(ctx)
			if err != nil {
				t.Fatal(err)
			}
			defer func() { _ = tx.Rollback(ctx) }()
			if _, err := tx.Exec(ctx, `SELECT pg_advisory_xact_lock(hashtextextended($1, 0))`, "user_a"); err != nil {
				t.Fatal(err)
			}

			done := make(chan error, 1)
			go func() { done <- del(newAccountService(pool)) }()
			select {
			case err := <-done:
				t.Fatalf("deletion finished while the push lock was held (err %v)", err)
			case <-time.After(300 * time.Millisecond):
			}
			if err := tx.Commit(ctx); err != nil {
				t.Fatal(err)
			}
			select {
			case err := <-done:
				if err != nil {
					t.Fatalf("deletion: %v", err)
				}
			case <-time.After(5 * time.Second):
				t.Fatal("deletion did not finish after the lock was released")
			}
		})
	}
}
