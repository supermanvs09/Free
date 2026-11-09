// Package migrations embeds the remediation migrations so the backend can
// create the remediation_* tables in a tenant schema on first use
// (REMEDIATOR_AUTO_MIGRATE), and the three global tables the API itself writes
// to (internal/platform/globalschema creates them at start when they are
// missing). scripts/migrate.sh applies the same files.
package migrations

import "embed"

//go:embed tenant/*_remediation_*.sql global/005_audit_logs.sql global/007_connection_approvals.sql global/009_connection_requests.sql
var FS embed.FS
