package credentialexposure

import (
	"context"
	"fmt"
	"log/slog"
	"strings"
	"sync"
	"time"

	"nhi-backend-api/internal/platform/config"
	"nhi-backend-api/internal/platform/database"
	"nhi-backend-api/internal/platform/scope"
)

// The secret scanner creates its tables lazily, per client schema and per
// platform ("a table is created the first time it's needed"), and has added
// columns in place over time (bitbucket_uri on 2026-11-04, the ML/noise
// columns on 2026-10-16). So a tenant schema can hold any subset of
//
//	secscan_findings                  every platform's findings, column platform
//	secscan_deep_findings             every platform's deep-scan findings
//	secscan_findings_<platform>       the same, before the scanner's table merge
//	secscan_deep_findings_<platform>  (afterwards these names are read-only
//	                                  views of the merged table and are not read)
//	secscan_ledger_<platform>         last scanned commit per branch
//	secscan_deepscan_<platform>       deep-scan requests and results
//	secscan_allowlist_dashboard       "marked safe"
//
// with older or newer column sets. Every query is built from what the schema
// actually has: a missing table is left out, a missing column reads as NULL.

// ScannerPlatforms are the scanner stacks, in display order.
var ScannerPlatforms = []string{"codecommit", "github", "bitbucket"}

const (
	kindFindings     = "findings"
	kindDeepFindings = "deep_findings"
)

// findingCol is one output column of a finding and the type to use when a
// table does not have it.
type findingCol struct {
	name     string
	nullType string
	required bool
}

// findingCols is the API's finding shape (the scanner's 43 columns minus
// ml_features, which is never returned), in output order.
var findingCols = []findingCol{
	{"finding_id", "text", true}, {"client_id", "text", true}, {"repository", "text", true},
	{"branch", "text", true}, {"commit_id", "text", true}, {"author", "text", true},
	{"created_at", "text", true}, {"detector", "text", true}, {"severity", "text", true},
	{"file_path", "text", true}, {"line_number", "integer", true}, {"redacted", "text", true},
	{"verification_status", "text", true}, {"risk_tier", "text", true}, {"recommended_action", "text", true},
	{"codecommit_uri", "text", false}, {"platform", "text", false}, {"github_uri", "text", false},
	{"bitbucket_uri", "text", false}, {"line_preview", "text", false}, {"confidence", "text", false},
	{"category", "text", false}, {"committer", "text", false}, {"commit_message", "text", false},
	{"commit_authored_at", "text", false}, {"files_changed", "integer", false}, {"additions", "integer", false},
	{"deletions", "integer", false}, {"repo_visibility", "text", false}, {"repo_stars", "integer", false},
	{"repo_forks", "integer", false}, {"repo_pushed_at", "text", false}, {"ml_score", "double precision", false},
	{"ml_decision", "text", false}, {"ml_model_version", "text", false}, {"analyst_decision", "text", false},
	{"analyst_decided_at", "text", false}, {"analyst_decided_by", "text", false},
	{"ml_veto_score", "double precision", false}, {"ml_veto_model_version", "text", false},
	{"value_fingerprint", "text", false}, {"noise_flags", "text", false},
}

// findingColumns is the output column list, for outer SELECTs.
var findingColumns = func() string {
	names := make([]string, len(findingCols))
	for i, c := range findingCols {
		names[i] = c.name
	}
	return strings.Join(names, ", ")
}()

// schemaCatalog is the scanner tables of one schema and their columns.
type schemaCatalog struct {
	tables map[string]map[string]bool
	at     time.Time
	// enabled is the company's switched-on sources (nil: every platform).
	enabled map[string]bool
}

// on reports whether the company scans platform p.
func (c *schemaCatalog) on(p string) bool { return c.enabled == nil || c.enabled[p] }

func (c *schemaCatalog) has(table string) bool {
	_, ok := c.tables[table]
	return ok
}

func (c *schemaCatalog) hasColumn(table, column string) bool {
	return c.tables[table][column]
}

// unified reports whether the schema has the merged table of kind
// (secscan_findings / secscan_deep_findings, one table for every platform).
// When it has, the per-platform names are views of it and are never read:
// reading both would count every finding twice.
func (c *schemaCatalog) unified(kind string) bool {
	return c.has("secscan_" + kind)
}

// platformTables returns, per platform in display order, where that
// platform's findings of kind are: its own table (secscan_findings_<platform>)
// or, after the merge, the merged table filtered on platform.
func (c *schemaCatalog) platformTables(kind string) []platformTable {
	out := make([]platformTable, 0, len(ScannerPlatforms))
	if c.unified(kind) {
		for _, p := range ScannerPlatforms {
			if c.on(p) {
				out = append(out, platformTable{platform: p, table: "secscan_" + kind, where: platformIs(c, "secscan_"+kind, p)})
			}
		}
		return out
	}
	for _, p := range ScannerPlatforms {
		name := "secscan_" + kind + "_" + p
		if c.has(name) && c.on(p) {
			out = append(out, platformTable{platform: p, table: name})
		}
	}
	return out
}

// platformTable returns where platform p's findings of kind are, if anywhere.
func (c *schemaCatalog) platformTable(kind, p string) (platformTable, bool) {
	for _, pt := range c.platformTables(kind) {
		if pt.platform == p {
			return pt, true
		}
	}
	return platformTable{}, false
}

// platformTable is one platform's findings: a table and, for the merged
// table, the condition on alias f that selects the platform's rows.
type platformTable struct{ platform, table, where string }

// platformOf is a row's platform in the merged table. A row the scanner wrote
// before it recorded platforms is CodeCommit (API guide, "SPLITTING BY PLATFORM").
func platformOf(c *schemaCatalog, table string) string {
	if !c.hasColumn(table, "platform") {
		return "'codecommit'::text"
	}
	return "COALESCE(NULLIF(f.platform,''),'codecommit')"
}

func platformIs(c *schemaCatalog, table, p string) string {
	return platformOf(c, table) + " = '" + p + "'"
}

// catalogTTL: the scanner adds tables rarely (a new platform, the first deep
// scan); a minute's delay before they are read is fine.
const catalogTTL = time.Minute

var catalogCache sync.Map // schema -> *schemaCatalog

// loadCatalog reads the scanner tables of the scope's schema (cached).
func loadCatalog(ctx context.Context, resolved *scope.DataScope) (*schemaCatalog, error) {
	if resolved == nil || resolved.DB == nil {
		return nil, errScopeRequired
	}
	key := resolved.Schema
	if v, ok := catalogCache.Load(key); ok {
		if c := v.(*schemaCatalog); time.Since(c.at) < catalogTTL {
			return withSources(ctx, resolved, c), nil
		}
	}
	rows, err := resolved.DB.QueryContext(ctx, `SELECT table_name, column_name FROM information_schema.columns
		WHERE table_schema = $1 AND table_name LIKE 'secscan\_%'`, resolved.Schema)
	if err != nil {
		return nil, fmt.Errorf("read scanner tables: %w", err)
	}
	defer rows.Close()
	c := &schemaCatalog{tables: map[string]map[string]bool{}, at: time.Now()}
	for rows.Next() {
		var table, column string
		if err := rows.Scan(&table, &column); err != nil {
			return nil, fmt.Errorf("read scanner columns: %w", err)
		}
		if c.tables[table] == nil {
			c.tables[table] = map[string]bool{}
		}
		c.tables[table][column] = true
	}
	if err := rows.Err(); err != nil {
		return nil, fmt.Errorf("read scanner columns: %w", err)
	}
	catalogCache.Store(key, c)
	return withSources(ctx, resolved, c), nil
}

// withSources is the catalog limited to the company's switched-on sources:
// GitHub and Bitbucket by nhi_global.tenants github_active / bitbucket_active.
// CodeCommit belongs to the company's AWS accounts and is always read. If the
// switches cannot be read, nothing is hidden.
func withSources(ctx context.Context, resolved *scope.DataScope, c *schemaCatalog) *schemaCatalog {
	if resolved.TenantID == "" {
		return c
	}
	var gh, bb bool
	err := resolved.DB.QueryRowContext(ctx, `SELECT COALESCE(to_jsonb(t)->>'github_active', '0') = '1', COALESCE(to_jsonb(t)->>'bitbucket_active', '0') = '1'
		FROM `+database.Table(config.DefaultGlobalSchema, "tenants")+` t WHERE t.tenant_id = $1::uuid`, resolved.TenantID).Scan(&gh, &bb)
	if err != nil {
		slog.Warn("credential exposure: could not read which sources are on, showing every platform", "tenant_id", resolved.TenantID, "err", err)
		return c
	}
	out := *c
	out.enabled = map[string]bool{"codecommit": true, "github": gh, "bitbucket": bb}
	return &out
}

// forgetCatalog drops a schema's cached catalog (tests, and after a write
// that failed on a table the cache said was there).
func forgetCatalog(schema string) { catalogCache.Delete(schema) }

// platformSelect reads one findings table, minus what a person marked safe.
// The platform column is filled from the table when a row predates it.
func platformSelect(cat *schemaCatalog, schema string, pt platformTable) (string, bool) {
	cols := make([]string, len(findingCols))
	for i, col := range findingCols {
		switch {
		case col.name == "platform" && pt.platform == "":
			cols[i] = platformOf(cat, pt.table) + " AS platform"
		case col.name == "platform" && cat.hasColumn(pt.table, "platform"):
			cols[i] = `COALESCE(NULLIF(f.platform,''),'` + pt.platform + `') AS platform`
		case col.name == "platform":
			cols[i] = `'` + pt.platform + `'::text AS platform`
		case cat.hasColumn(pt.table, col.name):
			cols[i] = "f." + col.name
		case col.required:
			return "", false // not a findings table this API can read
		default:
			cols[i] = "NULL::" + col.nullType + " AS " + col.name
		}
	}
	q := " SELECT " + strings.Join(cols, ",") + " FROM " + schema + "." + pt.table + " f"
	conds := []string{}
	if pt.where != "" {
		conds = append(conds, pt.where)
	}
	if cat.has("secscan_allowlist_dashboard") {
		conds = append(conds, "NOT EXISTS (SELECT 1 FROM "+schema+`.secscan_allowlist_dashboard a
		 WHERE a.client_id=f.client_id AND a.file_path=f.file_path AND a.detector=f.detector AND a.redacted=f.redacted)`)
	}
	if len(conds) > 0 {
		q += " WHERE " + strings.Join(conds, " AND ")
	}
	return q, true
}

// emptyFindings is a findings select with no rows, for a schema the scanner
// has not written to yet.
func emptyFindings() string {
	cols := make([]string, len(findingCols))
	for i, col := range findingCols {
		cols[i] = "NULL::" + col.nullType + " AS " + col.name
	}
	return " SELECT " + strings.Join(cols, ",") + " WHERE false"
}

// unionOf is every non-allowlisted row of the kind's tables.
func unionOf(cat *schemaCatalog, schema, kind string) string {
	if cat.unified(kind) {
		// One read of the merged table; platform comes from its column, and
		// only the company's switched-on sources are read.
		pt := platformTable{table: "secscan_" + kind}
		if cat.enabled != nil {
			on := []string{}
			for _, p := range ScannerPlatforms {
				if cat.on(p) {
					on = append(on, "'"+p+"'")
				}
			}
			if len(on) == 0 {
				return emptyFindings()
			}
			pt.where = platformOf(cat, pt.table) + " IN (" + strings.Join(on, ",") + ")"
		}
		if q, ok := platformSelect(cat, schema, pt); ok {
			return q
		}
		return emptyFindings()
	}
	parts := make([]string, 0, 3)
	for _, pt := range cat.platformTables(kind) {
		if q, ok := platformSelect(cat, schema, pt); ok {
			parts = append(parts, q)
		}
	}
	if len(parts) == 0 {
		return emptyFindings()
	}
	return strings.Join(parts, "\n UNION ALL")
}
