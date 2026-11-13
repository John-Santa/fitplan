package clerk_test

import (
	"context"
	"net/http"
	"net/http/httptest"
	"testing"

	"github.com/John-Santa/fitplan/api/internal/adapter/clerk"
)

// fakeClerkAPI answers DELETE /v1/users/{id} with status and records the call.
func fakeClerkAPI(t *testing.T, status int) (*httptest.Server, *[]string) {
	t.Helper()
	var calls []string
	srv := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		calls = append(calls, r.Method+" "+r.URL.Path+" "+r.Header.Get("Authorization"))
		w.Header().Set("Content-Type", "application/json")
		w.WriteHeader(status)
		switch status {
		case http.StatusOK:
			_, _ = w.Write([]byte(`{"id":"user_a","object":"user","deleted":true}`))
		default:
			_, _ = w.Write([]byte(`{"errors":[{"code":"resource_not_found","message":"not found"}]}`))
		}
	}))
	t.Cleanup(srv.Close)
	return srv, &calls
}

func TestUserDeleterDeletesTheUserWithTheSecretKey(t *testing.T) {
	srv, calls := fakeClerkAPI(t, http.StatusOK)
	d := clerk.NewUserDeleter("sk_test_secret", clerk.WithAPIURL(srv.URL+"/v1"))
	if err := d.DeleteUser(context.Background(), "user_a"); err != nil {
		t.Fatalf("DeleteUser: %v", err)
	}
	want := "DELETE /v1/users/user_a Bearer sk_test_secret"
	if len(*calls) != 1 || (*calls)[0] != want {
		t.Errorf("calls = %v, want [%s]", *calls, want)
	}
}

func TestUserDeleterTreatsAnAlreadyDeletedUserAsDeleted(t *testing.T) {
	srv, _ := fakeClerkAPI(t, http.StatusNotFound)
	d := clerk.NewUserDeleter("sk_test_secret", clerk.WithAPIURL(srv.URL+"/v1"))
	if err := d.DeleteUser(context.Background(), "user_a"); err != nil {
		t.Errorf("DeleteUser of a missing user = %v, want nil so a retry succeeds", err)
	}
}

func TestUserDeleterReportsOtherFailures(t *testing.T) {
	for _, status := range []int{http.StatusUnauthorized, http.StatusInternalServerError} {
		srv, _ := fakeClerkAPI(t, status)
		d := clerk.NewUserDeleter("sk_test_secret", clerk.WithAPIURL(srv.URL+"/v1"))
		if err := d.DeleteUser(context.Background(), "user_a"); err == nil {
			t.Errorf("status %d: DeleteUser = nil, want an error", status)
		}
	}
}

func TestUserDeleterRejectsAnEmptyUserID(t *testing.T) {
	srv, calls := fakeClerkAPI(t, http.StatusOK)
	d := clerk.NewUserDeleter("sk_test_secret", clerk.WithAPIURL(srv.URL+"/v1"))
	if err := d.DeleteUser(context.Background(), ""); err == nil {
		t.Error("DeleteUser(\"\") = nil, want an error")
	}
	if len(*calls) != 0 {
		t.Errorf("calls = %v, want none", *calls)
	}
}
