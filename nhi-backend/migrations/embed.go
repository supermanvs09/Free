// Package migrations embeds the remediation migrations so the backend can
// create the remediation_* tables in a tenant schema on first use
// (REMEDIATOR_AUTO_MIGRATE). scripts/migrate.sh applies the same files.
package migrations

import "embed"

//go:embed tenant/*_remediation_*.sql
var FS embed.FS
