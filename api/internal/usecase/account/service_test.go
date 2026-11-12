package account_test

import (
	"context"
	"errors"
	"slices"
	"testing"

	"github.com/John-Santa/fitplan/api/internal/domain/shared"
	"github.com/John-Santa/fitplan/api/internal/port"
	"github.com/John-Santa/fitplan/api/internal/usecase/account"
)

// recorder logs every call of the fakes in order, so tests can assert that
// the records are deleted before the identity.
type recorder struct{ calls []string }

type fakeStore struct {
	rec     *recorder
	failAcc error
	failDat error
}

func (f fakeStore) DeleteAccount(_ context.Context, userID shared.UserID) error {
	f.rec.calls = append(f.rec.calls, "store.DeleteAccount "+string(userID))
	return f.failAcc
}

func (f fakeStore) DeleteData(_ context.Context, userID shared.UserID) error {
	f.rec.calls = append(f.rec.calls, "store.DeleteData "+string(userID))
	return f.failDat
}

type fakeIdentity struct {
	rec  *recorder
	fail error
}

func (f fakeIdentity) DeleteUser(_ context.Context, userID shared.UserID) error {
	f.rec.calls = append(f.rec.calls, "identity.DeleteUser "+string(userID))
	return f.fail
}

func newService(rec *recorder, store fakeStore, identity fakeIdentity) *account.Service {
	store.rec, identity.rec = rec, rec
	return account.NewService(account.Deps{Store: store, Identity: identity})
}

func TestDeleteAccountDeletesRecordsFirstAndTheIdentityLast(t *testing.T) {
	rec := &recorder{}
	if err := newService(rec, fakeStore{}, fakeIdentity{}).DeleteAccount(context.Background(), "user_a"); err != nil {
		t.Fatalf("DeleteAccount: %v", err)
	}
	want := []string{"store.DeleteAccount user_a", "identity.DeleteUser user_a"}
	if !slices.Equal(rec.calls, want) {
		t.Errorf("calls = %v, want %v", rec.calls, want)
	}
}

func TestDeleteAccountKeepsTheIdentityWhenTheRecordsCannotBeDeleted(t *testing.T) {
	rec := &recorder{}
	boom := errors.New("db down")
	err := newService(rec, fakeStore{failAcc: boom}, fakeIdentity{}).DeleteAccount(context.Background(), "user_a")
	if !errors.Is(err, boom) {
		t.Fatalf("err = %v, want the store error", err)
	}
	if want := []string{"store.DeleteAccount user_a"}; !slices.Equal(rec.calls, want) {
		t.Errorf("calls = %v, want %v (the identity must survive a failed data delete)", rec.calls, want)
	}
}

func TestDeleteAccountReportsAFailedIdentityDeleteSoItCanBeRetried(t *testing.T) {
	rec := &recorder{}
	boom := errors.New("clerk down")
	svc := newService(rec, fakeStore{}, fakeIdentity{fail: boom})
	if err := svc.DeleteAccount(context.Background(), "user_a"); !errors.Is(err, boom) {
		t.Fatalf("err = %v, want the identity error", err)
	}
	// A retry runs the whole deletion again: the store side is idempotent.
	rec.calls = nil
	_ = svc.DeleteAccount(context.Background(), "user_a")
	want := []string{"store.DeleteAccount user_a", "identity.DeleteUser user_a"}
	if !slices.Equal(rec.calls, want) {
		t.Errorf("retry calls = %v, want %v", rec.calls, want)
	}
}

func TestDeleteDataKeepsTheAccountAndTheIdentity(t *testing.T) {
	rec := &recorder{}
	if err := newService(rec, fakeStore{}, fakeIdentity{}).DeleteData(context.Background(), "user_a"); err != nil {
		t.Fatalf("DeleteData: %v", err)
	}
	if want := []string{"store.DeleteData user_a"}; !slices.Equal(rec.calls, want) {
		t.Errorf("calls = %v, want %v", rec.calls, want)
	}
}

func TestDeleteDataReportsTheStoreError(t *testing.T) {
	boom := errors.New("db down")
	err := newService(&recorder{}, fakeStore{failDat: boom}, fakeIdentity{}).DeleteData(context.Background(), "user_a")
	if !errors.Is(err, boom) {
		t.Errorf("err = %v, want the store error", err)
	}
}

func TestDeletionsRequireAUser(t *testing.T) {
	rec := &recorder{}
	svc := newService(rec, fakeStore{}, fakeIdentity{})
	if err := svc.DeleteAccount(context.Background(), ""); !errors.Is(err, port.ErrUnauthorized) {
		t.Errorf("DeleteAccount err = %v, want ErrUnauthorized", err)
	}
	if err := svc.DeleteData(context.Background(), ""); !errors.Is(err, port.ErrUnauthorized) {
		t.Errorf("DeleteData err = %v, want ErrUnauthorized", err)
	}
	if len(rec.calls) != 0 {
		t.Errorf("calls = %v, want none without a user", rec.calls)
	}
}
