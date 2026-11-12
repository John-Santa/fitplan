// Package db embeds the SQL migrations so the binary can apply them on boot.
package db

import "embed"

// Migrations holds the goose migration files under migrations/.
//
//go:embed migrations/*.sql
var Migrations embed.FS
