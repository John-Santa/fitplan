package config_test

import (
	"testing"

	"github.com/John-Santa/fitplan/api/internal/platform/config"
)

func TestLoadMigrationDatabaseURLUnsetKeepsBootConfigUnchanged(t *testing.T) {
	cfg, err := config.Load(env(map[string]string{
		"DATABASE_URL":     "postgres://app",
		"CLERK_SECRET_KEY": "placeholder",
	}))
	if err != nil {
		t.Fatalf("Load: %v", err)
	}
	if cfg.MigrationDatabaseURL != "" {
		t.Errorf("MigrationDatabaseURL = %q, want empty", cfg.MigrationDatabaseURL)
	}
	if cfg.DatabaseURL != "postgres://app" {
		t.Errorf("DatabaseURL = %q, want postgres://app", cfg.DatabaseURL)
	}
}

func TestLoadMigrationDatabaseURLIsTrimmedAndSeparateFromDatabaseURL(t *testing.T) {
	cfg, err := config.Load(env(map[string]string{
		"DATABASE_URL":           "postgres://app",
		"MIGRATION_DATABASE_URL": "  postgres://owner  ",
		"CLERK_SECRET_KEY":       "placeholder",
	}))
	if err != nil {
		t.Fatalf("Load: %v", err)
	}
	if cfg.MigrationDatabaseURL != "postgres://owner" {
		t.Errorf("MigrationDatabaseURL = %q, want postgres://owner", cfg.MigrationDatabaseURL)
	}
	if cfg.DatabaseURL != "postgres://app" {
		t.Errorf("DatabaseURL = %q, want postgres://app", cfg.DatabaseURL)
	}
}
