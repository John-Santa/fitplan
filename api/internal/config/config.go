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
	// DatabaseURL is the Postgres connection string. Optional until the store is wired.
	DatabaseURL string
	// ClerkSecretKey is the Clerk backend API key. Optional until auth is wired.
	ClerkSecretKey string
}

// Addr returns the listen address in host:port form.
func (c Config) Addr() string { return ":" + c.Port }

// Load builds a Config from the given lookup function (typically os.Getenv).
func Load(getenv func(string) string) (Config, error) {
	cfg := Config{
		Port:           strings.TrimSpace(getenv("PORT")),
		AllowedOrigins: splitList(getenv("ALLOWED_ORIGINS")),
		DatabaseURL:    strings.TrimSpace(getenv("DATABASE_URL")),
		ClerkSecretKey: strings.TrimSpace(getenv("CLERK_SECRET_KEY")),
	}
	if cfg.Port == "" {
		cfg.Port = defaultPort
	}
	if n, err := strconv.Atoi(cfg.Port); err != nil || n < 1 || n > 65535 {
		return Config{}, fmt.Errorf("config: invalid PORT %q: must be an integer between 1 and 65535", cfg.Port)
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
