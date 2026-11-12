package httpapi

import (
	"encoding/json"
	"errors"
	"log/slog"
	"net/http"

	"github.com/John-Santa/fitplan/api/internal/domain/shared"
	"github.com/John-Santa/fitplan/api/internal/port"
)

// ProblemContentType is the media type of every error response (RFC 7807).
const ProblemContentType = "application/problem+json"

// Problem is an RFC 7807 problem details body. Type is always "about:blank",
// so Title is the HTTP status text; Detail carries the human-readable reason
// (for validation errors, the field path and rule, e.g.
// "documents[0].kind: must be plan or config, got \"habits\"").
type Problem struct {
	Type   string `json:"type"`
	Title  string `json:"title"`
	Status int    `json:"status"`
	Detail string `json:"detail"`
}

// WriteJSON writes v as a JSON response with the given status code.
func WriteJSON(w http.ResponseWriter, status int, v any) {
	w.Header().Set("Content-Type", "application/json")
	w.WriteHeader(status)
	_ = json.NewEncoder(w).Encode(v)
}

// WriteProblem writes a problem+json response.
func WriteProblem(w http.ResponseWriter, status int, detail string) {
	w.Header().Set("Content-Type", ProblemContentType)
	w.WriteHeader(status)
	_ = json.NewEncoder(w).Encode(Problem{
		Type:   "about:blank",
		Title:  http.StatusText(status),
		Status: status,
		Detail: detail,
	})
}

// writeUnauthorized is the 401 answer for every unauthenticated request.
func writeUnauthorized(w http.ResponseWriter, _ *http.Request) {
	w.Header().Set("WWW-Authenticate", `Bearer realm="magnifit"`)
	WriteProblem(w, http.StatusUnauthorized, "unauthorized")
}

// writeError maps a use-case error to a problem response. Unknown errors are
// logged and answered with an opaque 500.
func writeError(w http.ResponseWriter, r *http.Request, log *slog.Logger, err error) {
	var verr *shared.ValidationError
	switch {
	case errors.As(err, &verr):
		WriteProblem(w, http.StatusBadRequest, verr.Error())
	case errors.Is(err, port.ErrInvalid):
		WriteProblem(w, http.StatusBadRequest, err.Error())
	case errors.Is(err, port.ErrUnauthorized):
		writeUnauthorized(w, r)
	case errors.Is(err, port.ErrNotFound):
		WriteProblem(w, http.StatusNotFound, "not found")
	case errors.Is(err, port.ErrUnavailable):
		WriteProblem(w, http.StatusServiceUnavailable, "service unavailable")
	default:
		log.LogAttrs(r.Context(), slog.LevelError, "request failed", slog.Any("error", err))
		WriteProblem(w, http.StatusInternalServerError, "internal server error")
	}
}
