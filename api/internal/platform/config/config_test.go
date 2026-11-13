package config_test

import (
	"reflect"
	"strings"
	"testing"

	"github.com/John-Santa/fitplan/api/internal/platform/config"
)

func env(m map[string]string) func(string) string {
	return func(k string) string { return m[k] }
}

func TestLoadDefaults(t *testing.T) {
	cfg, err := config.Load(env(map[string]string{"APP_ENV": "test"}))
	if err != nil {
		t.Fatalf("Load: %v", err)
	}
	if cfg.Port != "8080" {
		t.Errorf("Port = %q, want 8080", cfg.Port)
	}
	if len(cfg.AllowedOrigins) != 0 {
		t.Errorf("AllowedOrigins = %v, want empty", cfg.AllowedOrigins)
	}
	if cfg.DatabaseURL != "" || cfg.ClerkSecretKey != "" {
		t.Errorf("optional values should default to empty: %+v", cfg)
	}
	if cfg.Addr() != ":8080" {
		t.Errorf("Addr = %q, want :8080", cfg.Addr())
	}
}

func TestLoadValues(t *testing.T) {
	cfg, err := config.Load(env(map[string]string{
		"PORT":             "9090",
		"ALLOWED_ORIGINS":  " https://app.magnifit.co , http://localhost:5173,,",
		"DATABASE_URL":     "postgres://example",
		"CLERK_SECRET_KEY": "placeholder",
		"CLERK_JWT_KEY":    " jwt-key ",
	}))
	if err != nil {
		t.Fatalf("Load: %v", err)
	}
	if cfg.ClerkJWTKey != "jwt-key" {
		t.Errorf("ClerkJWTKey = %q, want jwt-key", cfg.ClerkJWTKey)
	}
	if cfg.Port != "9090" || cfg.DatabaseURL != "postgres://example" || cfg.ClerkSecretKey != "placeholder" {
		t.Errorf("unexpected config: %+v", cfg)
	}
	want := []string{"https://app.magnifit.co", "http://localhost:5173"}
	if !reflect.DeepEqual(cfg.AllowedOrigins, want) {
		t.Errorf("AllowedOrigins = %v, want %v", cfg.AllowedOrigins, want)
	}
}

func TestLoadInvalidPort(t *testing.T) {
	for _, p := range []string{"abc", "0", "70000", "-1"} {
		if _, err := config.Load(env(map[string]string{"PORT": p, "APP_ENV": "test"})); err == nil {
			t.Errorf("PORT=%q: expected error", p)
		}
	}
}

func TestLoadRequiresDatabaseAndClerkOutsideTest(t *testing.T) {
	full := map[string]string{"DATABASE_URL": "postgres://example", "CLERK_SECRET_KEY": "placeholder"}
	for _, missing := range []string{"DATABASE_URL", "CLERK_SECRET_KEY"} {
		for _, appEnv := range []string{"", "production"} {
			m := map[string]string{"APP_ENV": appEnv}
			for k, v := range full {
				if k != missing {
					m[k] = v
				}
			}
			_, err := config.Load(env(m))
			if err == nil || !strings.Contains(err.Error(), missing) {
				t.Errorf("APP_ENV=%q without %s: err = %v, want it to name %s", appEnv, missing, err, missing)
			}
		}
	}
	cfg, err := config.Load(env(map[string]string{"APP_ENV": "test"}))
	if err != nil || cfg.AppEnv != "test" {
		t.Errorf("APP_ENV=test without secrets: cfg=%+v err=%v, want ok", cfg, err)
	}
}

// production returns a valid production environment with one override.
func production(key, value string) map[string]string {
	m := map[string]string{
		"APP_ENV":          "production",
		"ALLOWED_ORIGINS":  "https://app.magnifit.co",
		"DATABASE_URL":     "postgres://u:p@db.example/app?sslmode=require",
		"CLERK_SECRET_KEY": "placeholder",
	}
	m[key] = value
	return m
}

func TestLoadProductionRequiresAllowedOrigins(t *testing.T) {
	_, err := config.Load(env(production("ALLOWED_ORIGINS", " , ")))
	if err == nil || !strings.Contains(err.Error(), "ALLOWED_ORIGINS") {
		t.Errorf("production without ALLOWED_ORIGINS: err = %v, want it to name ALLOWED_ORIGINS", err)
	}
}

func TestLoadProductionRequiresDatabaseTLS(t *testing.T) {
	for _, url := range []string{
		"postgres://u:p@db.example/app",
		"postgres://u:p@db.example/app?sslmode=disable",
		"postgresql://u:p@db.example/app?sslmode=prefer",
		"host=db.example dbname=app sslmode=allow",
		"host=db.example dbname=app",
		// pgx applies the last sslmode, so a later insecure value must not slip through.
		"postgres://u:p@db.example/app?sslmode=require&sslmode=disable",
		"host=db.example dbname=app sslmode=require sslmode=disable",
	} {
		_, err := config.Load(env(production("DATABASE_URL", url)))
		if err == nil || !strings.Contains(err.Error(), "sslmode") {
			t.Errorf("production DATABASE_URL %q: err = %v, want an sslmode error", url, err)
		}
	}
	for _, url := range []string{
		"postgres://u:p@db.example/app?sslmode=require",
		"postgresql://u:p@db.example/app?sslmode=verify-full&channel_binding=require",
		"postgres://u:p@db.example/app?sslmode=verify-ca",
		"host=db.example dbname=app sslmode=verify-full",
	} {
		if _, err := config.Load(env(production("DATABASE_URL", url))); err != nil {
			t.Errorf("production DATABASE_URL %q: err = %v, want ok", url, err)
		}
	}
}

// Outside production the guards stay off, so local runs keep working.
func TestLoadNonProductionKeepsLocalRuns(t *testing.T) {
	for _, appEnv := range []string{"", "development"} {
		cfg, err := config.Load(env(map[string]string{
			"APP_ENV":          appEnv,
			"DATABASE_URL":     "postgres://u:p@localhost/app?sslmode=disable",
			"CLERK_SECRET_KEY": "placeholder",
		}))
		if err != nil || len(cfg.AllowedOrigins) != 0 {
			t.Errorf("APP_ENV=%q local run: cfg=%+v err=%v, want ok", appEnv, cfg, err)
		}
	}
}
