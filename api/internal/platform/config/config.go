// Package config loads the service configuration from environment variables.
package config

import (
	"fmt"
	"strconv"
	"strings"
)

const defaultPort = "8080"

// Config holds the typed runtime configuration.
type Config struct {
	// Port is the TCP port the HTTP server listens on.
	Port string
	// AllowedOrigins lists the browser origins permitted by CORS.
	AllowedOrigins []string
	// AppEnv names the environment (e.g. production, test). Only "test"
	// relaxes the required settings below.
	AppEnv string
	// DatabaseURL is the Postgres connection string. Required unless AppEnv is "test".
	DatabaseURL string
	// ClerkSecretKey is the Clerk backend API key. Required unless AppEnv is "test".
	ClerkSecretKey string
	// ClerkJWTKey is the Clerk instance's JWT public key. Optional: when set,
	// session tokens are verified without calling the Clerk API.
	ClerkJWTKey string
}

// IsTest reports whether the service runs in the test environment.
func (c Config) IsTest() bool { return c.AppEnv == "test" }

// Addr returns the listen address in host:port form.
func (c Config) Addr() string { return ":" + c.Port }

// Load builds a Config from the given lookup function (typically os.Getenv).
func Load(getenv func(string) string) (Config, error) {
	cfg := Config{
		Port:           strings.TrimSpace(getenv("PORT")),
		AppEnv:         strings.TrimSpace(getenv("APP_ENV")),
		AllowedOrigins: splitList(getenv("ALLOWED_ORIGINS")),
		DatabaseURL:    strings.TrimSpace(getenv("DATABASE_URL")),
		ClerkSecretKey: strings.TrimSpace(getenv("CLERK_SECRET_KEY")),
		ClerkJWTKey:    strings.TrimSpace(getenv("CLERK_JWT_KEY")),
	}
	if cfg.Port == "" {
		cfg.Port = defaultPort
	}
	if n, err := strconv.Atoi(cfg.Port); err != nil || n < 1 || n > 65535 {
		return Config{}, fmt.Errorf("config: invalid PORT %q: must be an integer between 1 and 65535", cfg.Port)
	}
	if !cfg.IsTest() {
		if cfg.DatabaseURL == "" {
			return Config{}, fmt.Errorf("config: DATABASE_URL is required (set APP_ENV=test to run without it)")
		}
		if cfg.ClerkSecretKey == "" {
			return Config{}, fmt.Errorf("config: CLERK_SECRET_KEY is required (set APP_ENV=test to run without it)")
		}
	}
	return cfg, nil
}

func splitList(raw string) []string {
	var out []string
	for _, part := range strings.Split(raw, ",") {
		if v := strings.TrimSpace(part); v != "" {
			out = append(out, v)
		}
	}
	return out
}
