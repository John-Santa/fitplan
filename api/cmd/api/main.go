// Command api runs the MagniFit HTTP API.
package main

import (
	"context"
	"errors"
	"fmt"
	"log/slog"
	"net/http"
	"os"
	"os/signal"
	"syscall"
	"time"

	"github.com/John-Santa/fitplan/api/internal/auth"
	"github.com/John-Santa/fitplan/api/internal/config"
	httpapi "github.com/John-Santa/fitplan/api/internal/http"
	"github.com/John-Santa/fitplan/api/internal/store"
	"github.com/John-Santa/fitplan/api/internal/sync"
)

const (
	shutdownTimeout = 15 * time.Second
	migrateTimeout  = 60 * time.Second
)

func main() {
	log := slog.New(slog.NewJSONHandler(os.Stdout, nil))
	slog.SetDefault(log)

	if err := run(log); err != nil {
		log.Error("fatal", slog.Any("error", err))
		os.Exit(1)
	}
}

func run(log *slog.Logger) error {
	cfg, err := config.Load(os.Getenv)
	if err != nil {
		return fmt.Errorf("load config: %w", err)
	}

	ctx, stop := signal.NotifyContext(context.Background(), os.Interrupt, syscall.SIGTERM)
	defer stop()

	var extra func(*http.ServeMux)
	if cfg.DatabaseURL != "" {
		pool, err := store.Open(ctx, cfg.DatabaseURL)
		if err != nil {
			return err
		}
		// Deferred before the server starts, so it runs after graceful shutdown.
		defer pool.Close()

		migrateCtx, cancel := context.WithTimeout(ctx, migrateTimeout)
		err = store.Migrate(migrateCtx, pool)
		cancel()
		if err != nil {
			return err
		}
		log.Info("migrations applied")

		authn := auth.DenyAll()
		if cfg.ClerkSecretKey != "" {
			authn = auth.NewClerk(cfg.ClerkSecretKey, cfg.AllowedOrigins)
		} else {
			log.Warn("CLERK_SECRET_KEY not set; /v1 routes reject every request")
		}
		extra = httpapi.V1{
			Auth:   authn,
			UserID: auth.UserID,
			Sync:   sync.NewService(store.NewPostgres(pool)),
			Logger: log,
		}.Register
	} else {
		log.Warn("DATABASE_URL not set; /v1 routes disabled")
	}

	srv := &http.Server{
		Addr: cfg.Addr(),
		Handler: httpapi.NewHandler(httpapi.Options{
			Logger:         log,
			AllowedOrigins: cfg.AllowedOrigins,
			Extra:          extra,
		}),
		ReadHeaderTimeout: 5 * time.Second,
		ReadTimeout:       15 * time.Second,
		WriteTimeout:      30 * time.Second,
		IdleTimeout:       60 * time.Second,
		ErrorLog:          slog.NewLogLogger(log.Handler(), slog.LevelError),
	}

	serveErr := make(chan error, 1)
	go func() {
		log.Info("server listening", slog.String("addr", srv.Addr))
		if err := srv.ListenAndServe(); err != nil && !errors.Is(err, http.ErrServerClosed) {
			serveErr <- err
		}
		close(serveErr)
	}()

	select {
	case err := <-serveErr:
		return fmt.Errorf("serve: %w", err)
	case <-ctx.Done():
		stop()
		log.Info("shutdown signal received")
	}

	shutdownCtx, cancel := context.WithTimeout(context.Background(), shutdownTimeout)
	defer cancel()
	if err := srv.Shutdown(shutdownCtx); err != nil {
		return fmt.Errorf("graceful shutdown: %w", err)
	}
	log.Info("server stopped")
	return nil
}
