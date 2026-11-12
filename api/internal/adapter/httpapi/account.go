package httpapi

import (
	"context"
	"log/slog"
	"net/http"

	"github.com/John-Santa/fitplan/api/internal/domain/shared"
)

// AccountService is the use case the deletion routes depend on
// (consumer-side port).
type AccountService interface {
	// DeleteAccount deletes every record of the user, remembers the user as
	// deleted and then deletes the identity. It is safe to retry.
	DeleteAccount(ctx context.Context, userID shared.UserID) error
	// DeleteData deletes every record of the user and keeps the account.
	DeleteData(ctx context.Context, userID shared.UserID) error
}

type accountHandlers struct {
	svc AccountService
	log *slog.Logger
}

// deleteMe serves DELETE /v1/me.
func (a accountHandlers) deleteMe(w http.ResponseWriter, r *http.Request) {
	a.run(w, r, a.svc.DeleteAccount)
}

// deleteData serves DELETE /v1/data.
func (a accountHandlers) deleteData(w http.ResponseWriter, r *http.Request) {
	a.run(w, r, a.svc.DeleteData)
}

// run answers 204 with no body when op succeeds for the authenticated user.
func (a accountHandlers) run(w http.ResponseWriter, r *http.Request, op func(context.Context, shared.UserID) error) {
	id, ok := requireUser(w, r)
	if !ok {
		return
	}
	if err := op(r.Context(), id); err != nil {
		writeError(w, r, a.log, err)
		return
	}
	w.WriteHeader(http.StatusNoContent)
}
