package clerk

import (
	"context"
	"errors"
	"fmt"
	"net/http"

	"github.com/clerk/clerk-sdk-go/v2"
	"github.com/clerk/clerk-sdk-go/v2/user"

	"github.com/John-Santa/fitplan/api/internal/domain/shared"
	"github.com/John-Santa/fitplan/api/internal/port"
)

// UserDeleter implements port.IdentityDeleter with the Clerk Backend API
// (DELETE /v1/users/{id}), authenticated with the instance's secret key.
type UserDeleter struct {
	users *user.Client
}

var _ port.IdentityDeleter = (*UserDeleter)(nil)

// UserDeleterOption customizes a UserDeleter.
type UserDeleterOption func(*clerk.BackendConfig)

// WithAPIURL points the deleter at another Clerk Backend API base URL
// (tests); the default is https://api.clerk.com/v1.
func WithAPIURL(url string) UserDeleterOption {
	return func(c *clerk.BackendConfig) { c.URL = clerk.String(url) }
}

// NewUserDeleter builds a deleter that authenticates with secretKey.
func NewUserDeleter(secretKey string, opts ...UserDeleterOption) *UserDeleter {
	cfg := &clerk.ClientConfig{}
	cfg.Key = clerk.String(secretKey)
	for _, o := range opts {
		o(&cfg.BackendConfig)
	}
	return &UserDeleter{users: user.NewClient(cfg)}
}

// DeleteUser deletes the Clerk user, which also ends all of their sessions.
// A user Clerk no longer knows (404) counts as deleted, so a retried account
// deletion succeeds.
func (d *UserDeleter) DeleteUser(ctx context.Context, userID shared.UserID) error {
	if userID == "" {
		return errors.New("clerk: delete user: empty user id")
	}
	if _, err := d.users.Delete(ctx, string(userID)); err != nil {
		var apiErr *clerk.APIErrorResponse
		if errors.As(err, &apiErr) && apiErr.HTTPStatusCode == http.StatusNotFound {
			return nil
		}
		return fmt.Errorf("clerk: delete user: %w", err)
	}
	return nil
}
