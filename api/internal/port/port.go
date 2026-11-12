// Package port declares the contracts between the use cases and the outside
// world: sentinel errors every adapter maps the same way, the authenticated
// identity carried in the request context, and the clock.
package port

import (
	"context"
	"errors"
	"net/http"
	"time"

	"github.com/John-Santa/fitplan/api/internal/domain/shared"
)

// Sentinel errors. Use cases wrap them; adapters map them with errors.Is.
var (
	// ErrInvalid marks invalid client input (HTTP 400). When the cause is a
	// *shared.ValidationError, its field-path message is the problem detail.
	ErrInvalid = errors.New("invalid input")
	// ErrUnauthorized marks a request without an authenticated user (HTTP 401).
	ErrUnauthorized = errors.New("unauthorized")
	// ErrNotFound marks a missing resource (HTTP 404).
	ErrNotFound = errors.New("not found")
	// ErrUnavailable marks a dependency that is down, e.g. the database (HTTP 503).
	ErrUnavailable = errors.New("service unavailable")
)

// Clock is the server time source; tests inject a fixed one.
type Clock interface {
	Now() time.Time
}

// ClockFunc adapts a function to Clock.
type ClockFunc func() time.Time

// Now returns f().
func (f ClockFunc) Now() time.Time { return f() }

// SystemClock is the real wall clock.
var SystemClock Clock = ClockFunc(time.Now)

// Authenticator verifies the credentials of a request. Authenticate wraps
// next so it only runs for authenticated requests, with the user id stored
// through WithUserID; any other request is answered by unauthorized and never
// reaches next. The identity provider (Clerk) implements it; the HTTP adapter
// owns the unauthorized response format.
type Authenticator interface {
	Authenticate(next, unauthorized http.Handler) http.Handler
}

type userIDKey struct{}

// WithUserID returns a context carrying the authenticated user id.
func WithUserID(ctx context.Context, id shared.UserID) context.Context {
	return context.WithValue(ctx, userIDKey{}, id)
}

// UserIDFrom returns the authenticated user id, if any. An empty id does not
// count as authenticated.
func UserIDFrom(ctx context.Context) (shared.UserID, bool) {
	id, ok := ctx.Value(userIDKey{}).(shared.UserID)
	return id, ok && id != ""
}
