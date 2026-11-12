// Package shared holds the domain types used by every bounded context.
// Like the rest of internal/domain it depends only on the standard library.
package shared

import "fmt"

// UserID is the authenticated user id (the Clerk user id, e.g. "user_2ab...").
// Every stored record is scoped by it.
type UserID string

// ValidationError reports invalid client input on one field path
// (e.g. "documents[0].kind"); adapters map it to 400.
type ValidationError struct {
	Field string
	Msg   string
}

func (e *ValidationError) Error() string { return e.Field + ": " + e.Msg }

// Invalid builds a ValidationError with a formatted message.
func Invalid(field, format string, args ...any) error {
	return &ValidationError{Field: field, Msg: fmt.Sprintf(format, args...)}
}
