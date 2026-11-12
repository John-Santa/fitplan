// Package migrations embeds the goose SQL migrations so the binary applies
// them on boot. Files under testdata/ are not migrations and are not embedded.
package migrations

import "embed"

// FS holds the goose migration files.
//
//go:embed *.sql
var FS embed.FS
