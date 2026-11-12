// Package clerk is the Clerk identity adapter: it verifies the session JWT sent
// as "Authorization: Bearer <token>" with the Clerk SDK v2 and exposes its
// subject (the Clerk user id) as the authenticated user id.
package clerk

import (
	"net/http"

	"github.com/clerk/clerk-sdk-go/v2"
	clerkhttp "github.com/clerk/clerk-sdk-go/v2/http"

	"github.com/John-Santa/fitplan/api/internal/domain/shared"
	"github.com/John-Santa/fitplan/api/internal/port"
)

// Authenticator implements port.Authenticator with Clerk.
type Authenticator struct {
	authorizedParties []string
}

var _ port.Authenticator = (*Authenticator)(nil)

// New configures the Clerk SDK with secretKey. When authorizedParties is not
// empty, the token's azp claim must be present and one of them (the front-end
// origins).
func New(secretKey string, authorizedParties []string) *Authenticator {
	clerk.SetKey(secretKey)
	return &Authenticator{authorizedParties: authorizedParties}
}

// Authenticate uses clerkhttp.WithHeaderAuthorization plus its own claims
// check instead of RequireHeaderAuthorization, because the latter answers a
// bodyless 403 when the token is missing or malformed; the API contract is a
// 401 rendered by unauthorized.
func (a *Authenticator) Authenticate(next, unauthorized http.Handler) http.Handler {
	opts := []clerkhttp.AuthorizationOption{clerkhttp.AuthorizationFailureHandler(unauthorized)}
	if check := authorizedParty(a.authorizedParties); check != nil {
		opts = append(opts, clerkhttp.AuthorizedParty(check))
	}
	return clerkhttp.WithHeaderAuthorization(opts...)(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		claims, ok := clerk.SessionClaimsFromContext(r.Context())
		if !ok || claims == nil || claims.Subject == "" {
			unauthorized.ServeHTTP(w, r)
			return
		}
		next.ServeHTTP(w, r.WithContext(port.WithUserID(r.Context(), shared.UserID(claims.Subject))))
	}))
}

// authorizedParty returns the azp check for a configured party list, or nil
// when none is configured (any azp accepted). Unlike the SDK's
// AuthorizedPartyMatches, a missing azp is rejected when a list is set.
func authorizedParty(allowed []string) func(string) bool {
	if len(allowed) == 0 {
		return nil
	}
	set := make(map[string]struct{}, len(allowed))
	for _, p := range allowed {
		set[p] = struct{}{}
	}
	return func(azp string) bool {
		if azp == "" {
			return false
		}
		_, ok := set[azp]
		return ok
	}
}
