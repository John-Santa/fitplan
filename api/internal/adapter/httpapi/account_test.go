package httpapi_test

import (
	"context"
	"errors"
	"net/http"
	"testing"

	"github.com/John-Santa/fitplan/api/internal/adapter/httpapi"
	"github.com/John-Santa/fitplan/api/internal/domain/shared"
	"github.com/John-Santa/fitplan/api/internal/port"
)

type fakeAccount struct {
	deletedAccounts []shared.UserID
	deletedData     []shared.UserID
	err             error
}

func (f *fakeAccount) DeleteAccount(_ context.Context, userID shared.UserID) error {
	f.deletedAccounts = append(f.deletedAccounts, userID)
	return f.err
}

func (f *fakeAccount) DeleteData(_ context.Context, userID shared.UserID) error {
	f.deletedData = append(f.deletedData, userID)
	return f.err
}

func accountHandler(acc *fakeAccount) http.Handler {
	return newRouter(httpapi.RouterConfig{Authenticator: fakeAuth{}, Sync: &fakeSync{}, Account: acc})
}

func TestDeleteMeDeletesTheCallerAndAnswers204(t *testing.T) {
	acc := &fakeAccount{}
	rec := send(accountHandler(acc), http.MethodDelete, "/v1/me", "", "user_42")
	if rec.Code != http.StatusNoContent || rec.Body.Len() != 0 {
		t.Fatalf("DELETE /v1/me = %d %q, want 204 with no body", rec.Code, rec.Body.String())
	}
	if len(acc.deletedAccounts) != 1 || acc.deletedAccounts[0] != "user_42" || len(acc.deletedData) != 0 {
		t.Errorf("accounts=%v data=%v, want only the caller's account deleted", acc.deletedAccounts, acc.deletedData)
	}
}

func TestDeleteDataDeletesOnlyTheCallerRecordsAndAnswers204(t *testing.T) {
	acc := &fakeAccount{}
	rec := send(accountHandler(acc), http.MethodDelete, "/v1/data", "", "user_42")
	if rec.Code != http.StatusNoContent || rec.Body.Len() != 0 {
		t.Fatalf("DELETE /v1/data = %d %q, want 204 with no body", rec.Code, rec.Body.String())
	}
	if len(acc.deletedData) != 1 || acc.deletedData[0] != "user_42" || len(acc.deletedAccounts) != 0 {
		t.Errorf("accounts=%v data=%v, want only the caller's data deleted", acc.deletedAccounts, acc.deletedData)
	}
}

func TestDeleteRoutesRequireAuth(t *testing.T) {
	acc := &fakeAccount{}
	h := accountHandler(acc)
	for _, path := range []string{"/v1/me", "/v1/data"} {
		rec := send(h, http.MethodDelete, path, "", "")
		if rec.Code != http.StatusUnauthorized || rec.Header().Get("WWW-Authenticate") == "" || errorOf(t, rec) != "unauthorized" {
			t.Errorf("DELETE %s = %d %q, want problem 401", path, rec.Code, rec.Body.String())
		}
	}
	if len(acc.deletedAccounts)+len(acc.deletedData) != 0 {
		t.Error("service reached without authentication")
	}
}

func TestDeleteFailureIsOpaque500(t *testing.T) {
	rec := send(accountHandler(&fakeAccount{err: errors.New("clerk: upstream said no")}), http.MethodDelete, "/v1/me", "", "user_42")
	if rec.Code != http.StatusInternalServerError || errorOf(t, rec) != "internal server error" {
		t.Errorf("DELETE /v1/me = %d %q, want opaque 500", rec.Code, rec.Body.String())
	}
}

func TestDeletedAccountAnswers410OnSync(t *testing.T) {
	h := v1Handler(&fakeSync{err: port.ErrGone})
	for _, tc := range []struct{ method, path, body string }{
		{http.MethodGet, "/v1/sync", ""}, {http.MethodPost, "/v1/sync", "{}"},
	} {
		rec := send(h, tc.method, tc.path, tc.body, "user_42")
		if rec.Code != http.StatusGone || errorOf(t, rec) != "account deleted" {
			t.Errorf("%s %s = %d %q, want problem 410 account deleted", tc.method, tc.path, rec.Code, rec.Body.String())
		}
	}
}

func TestDeleteRoutesUnmountedWithoutAccountService(t *testing.T) {
	h := v1Handler(&fakeSync{})
	if rec := send(h, http.MethodDelete, "/v1/data", "", "user_42"); rec.Code != http.StatusNotFound {
		t.Errorf("DELETE /v1/data = %d, want 404 without an account service", rec.Code)
	}
	// GET /v1/me keeps answering as before when only sync is configured.
	if rec := send(h, http.MethodGet, "/v1/me", "", "user_42"); rec.Code != http.StatusOK {
		t.Errorf("GET /v1/me = %d, want 200", rec.Code)
	}
}
