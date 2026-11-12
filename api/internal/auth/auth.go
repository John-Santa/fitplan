// Package auth authenticates requests and carries the user id in the context.
// The Clerk adapter is the production implementation; tests plug in fakes.
package auth

import (
	"context"
	"encoding/json"
	"net/http"

	"github.com/clerk/clerk-sdk-go/v2"
	clerkhttp "github.com/clerk/clerk-sdk-go/v2/http"
)

// Authenticator wraps a handler so it only runs for authenticated requests,
// with the user id available through UserID. Unauthenticated requests get a
// JSON 401 and never reach the wrapped handler.
type Authenticator func(http.Handler) http.Handler

type ctxKey struct{}

// WithUserID returns a context carrying the authenticated user id.
func WithUserID(ctx context.Context, userID string) context.Context {
	return context.WithValue(ctx, ctxKey{}, userID)
}

// UserID returns the authenticated user id, if any.
func UserID(ctx context.Context) (string, bool) {
	id, ok := ctx.Value(ctxKey{}).(string)
	return id, ok && id != ""
}

// NewClerk returns an Authenticator that verifies a Clerk session JWT sent as
// "Authorization: Bearer <token>" and uses its subject (the Clerk user id) as
// the user id. When authorizedParties is not empty, the token's azp claim must
// be one of them (the front-end origins).
//
// It uses clerkhttp.WithHeaderAuthorization plus its own claims check instead
// of RequireHeaderAuthorization, because the latter answers a bodyless 403 when
// the token is missing or malformed; the API contract is a JSON 401.
func NewClerk(secretKey string, authorizedParties []string) Authenticator {
	clerk.SetKey(secretKey)
	opts := []clerkhttp.AuthorizationOption{
		clerkhttp.AuthorizationFailureHandler(http.HandlerFunc(unauthorized)),
	}
	if len(authorizedParties) > 0 {
		opts = append(opts, clerkhttp.AuthorizedPartyMatches(authorizedParties...))
	}
	withClaims := clerkhttp.WithHeaderAuthorization(opts...)
	return func(next http.Handler) http.Handler {
		return withClaims(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
			claims, ok := clerk.SessionClaimsFromContext(r.Context())
			if !ok || claims == nil || claims.Subject == "" {
				unauthorized(w, r)
				return
			}
			next.ServeHTTP(w, r.WithContext(WithUserID(r.Context(), claims.Subject)))
		}))
	}
}

// DenyAll rejects every request; used when no identity provider is configured.
func DenyAll() Authenticator {
	return func(http.Handler) http.Handler { return http.HandlerFunc(unauthorized) }
}

func unauthorized(w http.ResponseWriter, _ *http.Request) {
	w.Header().Set("Content-Type", "application/json")
	w.Header().Set("WWW-Authenticate", `Bearer realm="magnifit"`)
	w.WriteHeader(http.StatusUnauthorized)
	_ = json.NewEncoder(w).Encode(map[string]string{"error": "unauthorized"})
}
