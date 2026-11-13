// Command magnifit-api runs the MagniFit HTTP API. It is the composition
// root: it loads the config, builds the adapters and wires them by hand.
package main

import (
	"context"
	"fmt"
	"log/slog"
	"os"
	"os/signal"
	"syscall"
	"time"

	"github.com/jackc/pgx/v5/pgxpool"

	"github.com/John-Santa/fitplan/api/internal/adapter/clerk"
	"github.com/John-Santa/fitplan/api/internal/adapter/httpapi"
	"github.com/John-Santa/fitplan/api/internal/adapter/postgres"
	"github.com/John-Santa/fitplan/api/internal/platform/config"
	"github.com/John-Santa/fitplan/api/internal/platform/httpserver"
	"github.com/John-Santa/fitplan/api/internal/platform/logging"
	"github.com/John-Santa/fitplan/api/internal/platform/postgresdb"
	"github.com/John-Santa/fitplan/api/internal/port"
	accountuc "github.com/John-Santa/fitplan/api/internal/usecase/account"
	syncuc "github.com/John-Santa/fitplan/api/internal/usecase/sync"
)

const migrateTimeout = 60 * time.Second

func main() {
	log := logging.New(os.Stdout, slog.LevelInfo)
	slog.SetDefault(log)
	if err := run(log); err != nil {
		log.ErrorContext(context.Background(), "fatal", slog.Any("error", err))
		os.Exit(1)
	}
}

// migrateOnBoot applies the migrations. With an empty migrationURL they run on
// the serving pool. Otherwise they run (advisory lock included) on a dedicated
// pool opened from migrationURL, which is closed before returning, so the
// serving role can be limited to data access.
func migrateOnBoot(
	ctx context.Context,
	migrationURL string,
	serving *pgxpool.Pool,
	open func(context.Context, string) (*pgxpool.Pool, error),
	migrate func(context.Context, *pgxpool.Pool) error,
) error {
	if migrationURL == "" {
		return migrate(ctx, serving)
	}
	pool, err := open(ctx, migrationURL)
	if err != nil {
		return fmt.Errorf("open migration connection: %w", err)
	}
	defer pool.Close()
	return migrate(ctx, pool)
}

func run(log *slog.Logger) error {
	cfg, err := config.Load(os.Getenv)
	if err != nil {
		return fmt.Errorf("load config: %w", err)
	}

	ctx, stop := signal.NotifyContext(context.Background(), os.Interrupt, syscall.SIGTERM)
	defer stop()

	routes := httpapi.RouterConfig{
		Logger:         log,
		AllowedOrigins: cfg.AllowedOrigins,
		RateLimit:      httpapi.RateLimitConfig{RPS: cfg.RateLimitRPS, Burst: cfg.RateLimitBurst},
	}

	if cfg.ClerkSecretKey != "" {
		auth := clerk.New(cfg.ClerkSecretKey, cfg.AllowedOrigins)
		if cfg.ClerkJWTKey != "" {
			if auth, err = auth.WithJWTKey(cfg.ClerkJWTKey); err != nil {
				return err
			}
		} else {
			log.WarnContext(ctx, "CLERK_JWT_KEY not set; token verification fetches signing keys from the Clerk API")
		}
		routes.Authenticator = auth
	} else {
		log.WarnContext(ctx, "CLERK_SECRET_KEY not set; protected routes reject every request")
	}

	if cfg.DatabaseURL != "" {
		pool, err := postgresdb.Open(ctx, cfg.DatabaseURL)
		if err != nil {
			return err
		}
		// Deferred before the server starts, so it runs after graceful shutdown.
		defer pool.Close()

		migrateCtx, cancel := context.WithTimeout(ctx, migrateTimeout)
		err = migrateOnBoot(migrateCtx, cfg.MigrationDatabaseURL, pool, postgresdb.Open, postgres.Migrate)
		cancel()
		if err != nil {
			return err
		}
		log.InfoContext(ctx, "migrations applied")

		store := postgres.NewSyncStore(pool)
		routes.Sync = syncuc.NewService(syncuc.Deps{Reader: store, Writer: store, Clock: port.SystemClock})
		routes.Readiness = pool
		// Deleting an account also deletes the Clerk user, which needs the
		// secret key; without it the deletion routes stay unmounted.
		if cfg.ClerkSecretKey != "" {
			routes.Account = accountuc.NewService(accountuc.Deps{
				Store:    store,
				Identity: clerk.NewUserDeleter(cfg.ClerkSecretKey),
			})
		}
	} else {
		log.WarnContext(ctx, "DATABASE_URL not set; /v1 routes disabled")
	}

	srv := httpserver.New(cfg.Addr(), httpapi.NewRouter(routes), log)
	return httpserver.Run(ctx, srv, log)
}
