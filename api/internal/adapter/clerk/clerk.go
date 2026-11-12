// Package clerk is the Clerk identity adapter: it verifies the session JWT sent
// as "Authorization: Bearer <token>" with the Clerk SDK v2 and exposes its
// subject (the Clerk user id) as the authenticated user id.
package clerk

import (
	"fmt"
	"net/http"
	"strings"

	"github.com/clerk/clerk-sdk-go/v2"
	clerkhttp "github.com/clerk/clerk-sdk-go/v2/http"

	"github.com/John-Santa/fitplan/api/internal/domain/shared"
	"github.com/John-Santa/fitplan/api/internal/port"
)

// Authenticator implements port.Authenticator with Clerk.
type Authenticator struct {
	authorizedParties []string
	// jwtKey, when set, verifies tokens without calling the Clerk API.
	jwtKey string
}

var _ port.Authenticator = (*Authenticator)(nil)

// New configures the Clerk SDK with secretKey. When authorizedParties is not
// empty, the token's azp claim must be present and one of them (the front-end
// origins).
func New(secretKey string, authorizedParties []string) *Authenticator {
	clerk.SetKey(secretKey)
	return &Authenticator{authorizedParties: authorizedParties}
}

// WithJWTKey makes the authenticator verify session tokens with the instance's
// JWT public key (CLERK_JWT_KEY) instead of fetching the signing key from the
// Clerk Backend API. Without it, every token carrying an unknown key id costs
// one outbound request before its signature is checked, which lets
// unauthenticated callers spend the instance's Clerk API quota. The key is
// parsed here so a wrong value fails at startup, not on the first request.
func (a *Authenticator) WithJWTKey(key string) (*Authenticator, error) {
	key = strings.TrimSpace(key)
	if key == "" {
		return nil, fmt.Errorf("clerk: empty JWT key")
	}
	// Same normalization as clerkhttp.JSONWebKey: the dashboard also offers
	// the key as one line without the PEM header and footer.
	pem := key
	if !strings.HasPrefix(pem, "-----BEGIN") {
		pem = "-----BEGIN PUBLIC KEY-----\n" + pem + "\n-----END PUBLIC KEY-----"
	}
	if _, err := clerk.JSONWebKeyFromPEM(pem); err != nil {
		return nil, fmt.Errorf("clerk: invalid JWT key: %w", err)
	}
	return &Authenticator{authorizedParties: a.authorizedParties, jwtKey: key}, nil
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
	if a.jwtKey != "" {
		opts = append(opts, clerkhttp.JSONWebKey(a.jwtKey))
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
