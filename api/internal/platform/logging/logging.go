// Package logging builds the JSON slog logger and carries the request id in
// the context so every log line written with a *Context method is correlated.
package logging

import (
	"context"
	"io"
	"log/slog"
)

type requestIDKey struct{}

// WithRequestID returns a context carrying the request id.
func WithRequestID(ctx context.Context, id string) context.Context {
	return context.WithValue(ctx, requestIDKey{}, id)
}

// RequestID returns the request id stored in ctx, or "".
func RequestID(ctx context.Context) string {
	id, _ := ctx.Value(requestIDKey{}).(string)
	return id
}

// New returns a JSON logger writing to w that adds request_id to every record
// whose context carries one.
func New(w io.Writer, level slog.Leveler) *slog.Logger {
	return slog.New(ContextHandler{Handler: slog.NewJSONHandler(w, &slog.HandlerOptions{Level: level})})
}

// ContextHandler decorates a handler with the request id from the context.
type ContextHandler struct {
	slog.Handler
}

// Handle adds request_id when the context carries one.
func (h ContextHandler) Handle(ctx context.Context, r slog.Record) error {
	if id := RequestID(ctx); id != "" {
		r.AddAttrs(slog.String("request_id", id))
	}
	return h.Handler.Handle(ctx, r)
}

// WithAttrs keeps the decoration on derived handlers.
func (h ContextHandler) WithAttrs(attrs []slog.Attr) slog.Handler {
	return ContextHandler{Handler: h.Handler.WithAttrs(attrs)}
}

// WithGroup keeps the decoration on derived handlers.
func (h ContextHandler) WithGroup(name string) slog.Handler {
	return ContextHandler{Handler: h.Handler.WithGroup(name)}
}
