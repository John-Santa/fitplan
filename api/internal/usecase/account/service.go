// Package account is the application use case for deleting a user's cloud
// data (DELETE /v1/data) or the whole account (DELETE /v1/me).
package account

import (
	"context"
	"fmt"

	"github.com/John-Santa/fitplan/api/internal/domain/shared"
	"github.com/John-Santa/fitplan/api/internal/port"
)

// Store deletes the records of one user. Both methods run under the same
// per-user lock a push takes, so no push of that user interleaves with them,
// and both are idempotent.
type Store interface {
	// DeleteAccount deletes every record and the user row, and remembers the
	// user as deleted so later pushes and pulls fail with port.ErrGone.
	DeleteAccount(ctx context.Context, userID shared.UserID) error
	// DeleteData deletes every synced record of the user; the account stays.
	DeleteData(ctx context.Context, userID shared.UserID) error
}

// Deps are the collaborators of Service.
type Deps struct {
	Store    Store
	Identity port.IdentityDeleter
}

// Service implements the deletions.
type Service struct {
	store    Store
	identity port.IdentityDeleter
}

// NewService builds a Service.
func NewService(d Deps) *Service {
	return &Service{store: d.Store, identity: d.Identity}
}

// DeleteAccount deletes the records first and the identity last: if the
// records cannot be deleted the account still exists and the user can retry;
// if the identity cannot be deleted the records are already gone and a retry
// runs the whole deletion again.
func (s *Service) DeleteAccount(ctx context.Context, userID shared.UserID) error {
	if userID == "" {
		return fmt.Errorf("delete account: %w", port.ErrUnauthorized)
	}
	if err := s.store.DeleteAccount(ctx, userID); err != nil {
		return fmt.Errorf("delete account records: %w", err)
	}
	if err := s.identity.DeleteUser(ctx, userID); err != nil {
		return fmt.Errorf("delete account identity: %w", err)
	}
	return nil
}

// DeleteData deletes every synced record of the user and keeps the account.
func (s *Service) DeleteData(ctx context.Context, userID shared.UserID) error {
	if userID == "" {
		return fmt.Errorf("delete data: %w", port.ErrUnauthorized)
	}
	if err := s.store.DeleteData(ctx, userID); err != nil {
		return fmt.Errorf("delete data: %w", err)
	}
	return nil
}
