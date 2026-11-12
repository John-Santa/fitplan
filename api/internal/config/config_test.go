package config_test

import (
	"reflect"
	"testing"

	"github.com/John-Santa/fitplan/api/internal/config"
)

func env(m map[string]string) func(string) string {
	return func(k string) string { return m[k] }
}

func TestLoadDefaults(t *testing.T) {
	cfg, err := config.Load(env(nil))
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
	}))
	if err != nil {
		t.Fatalf("Load: %v", err)
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
		if _, err := config.Load(env(map[string]string{"PORT": p})); err == nil {
			t.Errorf("PORT=%q: expected error", p)
		}
	}
}
