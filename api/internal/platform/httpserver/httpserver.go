// Package httpserver runs an http.Server with production timeouts and a
// graceful shutdown on context cancellation.
package httpserver

import (
	"context"
	"errors"
	"fmt"
	"log/slog"
	"net/http"
	"time"
)

// ShutdownTimeout bounds how long in-flight requests may finish after a stop signal.
const ShutdownTimeout = 15 * time.Second

// New builds the server with read/write/idle timeouts.
func New(addr string, h http.Handler, log *slog.Logger) *http.Server {
	return &http.Server{
		Addr:              addr,
		Handler:           h,
		ReadHeaderTimeout: 5 * time.Second,
		ReadTimeout:       15 * time.Second,
		WriteTimeout:      30 * time.Second,
		IdleTimeout:       60 * time.Second,
		ErrorLog:          slog.NewLogLogger(log.Handler(), slog.LevelError),
	}
}

// Run serves until ctx is cancelled, then shuts down gracefully.
func Run(ctx context.Context, srv *http.Server, log *slog.Logger) error {
	serveErr := make(chan error, 1)
	go func() {
		log.InfoContext(ctx, "server listening", slog.String("addr", srv.Addr))
		if err := srv.ListenAndServe(); err != nil && !errors.Is(err, http.ErrServerClosed) {
			serveErr <- err
		}
		close(serveErr)
	}()

	select {
	case err := <-serveErr:
		return fmt.Errorf("serve: %w", err)
	case <-ctx.Done():
		log.InfoContext(ctx, "shutdown signal received")
	}

	shutdownCtx, cancel := context.WithTimeout(context.WithoutCancel(ctx), ShutdownTimeout)
	defer cancel()
	if err := srv.Shutdown(shutdownCtx); err != nil {
		return fmt.Errorf("graceful shutdown: %w", err)
	}
	log.InfoContext(shutdownCtx, "server stopped")
	return nil
}
