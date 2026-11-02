package identitylist

import (
	"context"
	"database/sql"
	"fmt"
	"strings"

	"github.com/lib/pq"

	"nhi-backend-api/internal/modules/posture/common"
	"nhi-backend-api/internal/platform/scope"
)

type IdentitiesListRepository struct{}

func NewIdentitiesListRepository() *IdentitiesListRepository {
	return &IdentitiesListRepository{}
}

// ─────────────────────────────────────────────────────────────────────────
// Filter builder — shared by the list, the facets and the CSV export
// ─────────────────────────────────────────────────────────────────────────

// Facet names, one per filter that has a facet counter.
const (
	FacetBand     = "band"
	FacetSeverity = "severity"
	FacetCategory = "category"
	FacetAccount  = "account"
	FacetType     = "type"
	FacetPillar   = "pillar"
	FacetChanged  = "changed"
	facetOther    = "" // filters without a facet (failing_check, q) apply everywhere
)

// fragment is one WHERE condition on ispm_identity_posture (alias p).
type fragment struct {
	facet string
	sql   string
}

// queryBuilder collects bind arguments. $1 is always the tenant.
type queryBuilder struct {
	Args []any
}

func NewQueryBuilder(s *scope.DataScope) *queryBuilder {
	return &queryBuilder{Args: []any{s.TenantID}}
}

func (b *queryBuilder) add(v any) string {
	b.Args = append(b.Args, v)
	return fmt.Sprintf("$%d", len(b.Args))
}

// severityColumn maps a severity to its failed-count column on the posture row.
var SeverityColumn = map[string]string{
	"critical": "p.failed_critical",
	"high":     "p.failed_high",
	"medium":   "p.failed_medium",
	"low":      "p.failed_low",
}

// buildFragments turns the filter into WHERE conditions. Values are always
// bound as parameters; the only interpolated text is the window's change
// column, which comes from a fixed table.
func (b *queryBuilder) BuildFragments(s *scope.DataScope, f common.IdentityFilter) []fragment {
	var out []fragment
	if len(f.Bands) > 0 {
		out = append(out, fragment{FacetBand, "p.band = ANY(" + b.add(pq.Array(f.Bands)) + "::text[])"})
	}
	if len(f.Severities) > 0 {
		var parts []string
		for _, sev := range f.Severities {
			if col, ok := SeverityColumn[strings.ToLower(sev)]; ok {
				parts = append(parts, "COALESCE("+col+", 0) > 0")
			}
		}
		if len(parts) > 0 {
			out = append(out, fragment{FacetSeverity, "(" + strings.Join(parts, " OR ") + ")"})
		}
	}
	if len(f.Categories) > 0 {
		out = append(out, fragment{FacetCategory, "p.functional_class = ANY(" + b.add(pq.Array(f.Categories)) + "::text[])"})
	}
	if len(f.Accounts) > 0 {
		out = append(out, fragment{FacetAccount, "p.account_id = ANY(" + b.add(pq.Array(f.Accounts)) + "::text[])"})
	}
	if len(f.Types) > 0 {
		// The handler upper-cases the values; compare without regard to case so
		// the filter matches however the worker stored the type (LAMBDA, lambda_function, …).
		out = append(out, fragment{FacetType, "upper(p.identity_type) = ANY(" + b.add(pq.Array(f.Types)) + "::text[])"})
	}
	if len(f.Pillars) > 0 {
		out = append(out, fragment{FacetPillar, "p.weakest_pillar = ANY(" + b.add(pq.Array(f.Pillars)) + "::text[])"})
	}
	if len(f.FailingChecks) > 0 {
		out = append(out, fragment{facetOther, fmt.Sprintf(`EXISTS (SELECT 1 FROM %s c
			WHERE c.tenant_id = p.tenant_id AND c.identity_id = p.identity_id
			  AND c.rule_id = ANY(%s::text[]) AND c.status = 'FAIL')`, s.Table(common.TIdentityChecks), b.add(pq.Array(f.FailingChecks)))})
	}
	if c := changedCondition(f.Changed, f.Window); c != "" {
		out = append(out, fragment{FacetChanged, c})
	}
	if q := strings.TrimSpace(f.Q); q != "" {
		ph := b.add("%" + common.EscapeLike(q) + "%")
		out = append(out, fragment{facetOther, `(p.identity_name ILIKE ` + ph + ` ESCAPE '\' OR p.identity_arn ILIKE ` + ph + ` ESCAPE '\')`})
	}
	return out
}

// changedCondition is the score-change test for ?changed=down|up|same.
func changedCondition(kind string, w common.Window) string {
	col := "p." + w.ChangeColumn
	switch kind {
	case common.ChangedDown:
		return col + " < 0"
	case common.ChangedUp:
		return col + " > 0"
	case common.ChangedSame:
		return col + " = 0"
	}
	return ""
}

// whereExcept joins the tenant test and every fragment except those of one facet.
func WhereExcept(frags []fragment, skipFacet string) string {
	parts := []string{"p.tenant_id = $1"}
	for _, fr := range frags {
		if skipFacet != "" && fr.facet == skipFacet {
			continue
		}
		parts = append(parts, fr.sql)
	}
	return strings.Join(parts, " AND ")
}

// ─────────────────────────────────────────────────────────────────────────
// Sorting and keyset pagination
// ─────────────────────────────────────────────────────────────────────────

type sortSpec struct {
	// expr is the sort expression with %s standing for the table alias.
	expr string
	desc bool
}

func sortFor(key string, w common.Window) sortSpec {
	switch key {
	case common.SortScoreDesc:
		return sortSpec{expr: "%s.score", desc: true}
	case common.SortFailed:
		return sortSpec{expr: "COALESCE(%s.checks_failed, 0)", desc: true}
	case common.SortChange:
		// biggest drop first; identities without history go last
		return sortSpec{expr: "COALESCE(%s." + w.ChangeColumn + ", 1000000)"}
	case common.SortName:
		return sortSpec{expr: "COALESCE(%s.identity_name, '')"}
	}
	return sortSpec{expr: "%s.score"}
}

func (sp sortSpec) on(alias string) string { return fmt.Sprintf(sp.expr, alias) }

func (sp sortSpec) dir() string {
	if sp.desc {
		return "DESC"
	}
	return "ASC"
}

func (sp sortSpec) cmp() string {
	if sp.desc {
		return "<"
	}
	return ">"
}

// identityCursor carries the sort key and the last identity of the page. The
// next page is found with a row comparison against that identity's own row,
// so it works for any column type and needs no value in the cursor.
type identityCursor struct {
	Sort string `json:"s"`
	ID   string `json:"id"`
}

// ─────────────────────────────────────────────────────────────────────────
// Row loading
// ─────────────────────────────────────────────────────────────────────────

// IdentityRow is one posture row as read for the list and the export.
type IdentityRow struct {
	IdentityID    string
	Name          string
	Type          string
	Class         sql.NullString
	AccountID     string
	AccountName   string
	Score         sql.NullFloat64
	Band          string
	Grade         string
	WeakestPillar sql.NullString
	Failed        sql.NullInt64
	Critical      sql.NullInt64
	High          sql.NullInt64
	Medium        sql.NullInt64
	Low           sql.NullInt64
	CredType      sql.NullString
	CredAgeDays   sql.NullInt64
	Change        sql.NullFloat64
	OpenAlerts    sql.NullInt64
	ARN           string
}

const identityRowColumns = `p.identity_id, COALESCE(p.identity_name, ''), COALESCE(p.identity_type, ''), p.functional_class,
	COALESCE(p.account_id, ''), COALESCE(p.account_name, ''), p.score, COALESCE(p.band, ''), COALESCE(p.grade, ''),
	p.weakest_pillar, p.checks_failed, p.failed_critical, p.failed_high, p.failed_medium, p.failed_low,
	p.credential_type, p.credential_age_days, p.%s, p.open_alerts, COALESCE(p.identity_arn, '')`

// queryIdentityPage reads up to `limit` rows after `afterID` (empty for the
// first page) in the filter's sort order.
func (r *IdentitiesListRepository) QueryIdentityPage(ctx context.Context, s *scope.DataScope, f common.IdentityFilter, afterID string, limit int) ([]IdentityRow, error) {
	b := NewQueryBuilder(s)
	frags := b.BuildFragments(s, f)
	where := WhereExcept(frags, "")
	sp := sortFor(f.Sort, f.Window)
	table := s.Table(common.TIdentityPosture)

	if afterID != "" {
		ph := b.add(afterID)
		where += fmt.Sprintf(` AND (%s, p.identity_id) %s (SELECT %s, x.identity_id FROM %s x WHERE x.tenant_id = $1 AND x.identity_id = %s)`,
			sp.on("p"), sp.cmp(), sp.on("x"), table, ph)
	}
	limitPH := b.add(limit)
	q := fmt.Sprintf(`SELECT `+identityRowColumns+`
		FROM %s p
		WHERE %s
		ORDER BY %s %s, p.identity_id %s
		LIMIT %s`, f.Window.ChangeColumn, table, where, sp.on("p"), sp.dir(), sp.dir(), limitPH)

	rows, err := s.DB.QueryContext(ctx, q, b.Args...)
	if common.IsUndefinedTable(err) { // no posture evaluation has run for this tenant yet
		return []IdentityRow{}, nil
	}
	if err != nil {
		return nil, fmt.Errorf("query identities: %w", err)
	}
	defer rows.Close()
	out := make([]IdentityRow, 0, limit)
	for rows.Next() {
		var r IdentityRow
		if err := rows.Scan(&r.IdentityID, &r.Name, &r.Type, &r.Class, &r.AccountID, &r.AccountName, &r.Score, &r.Band, &r.Grade,
			&r.WeakestPillar, &r.Failed, &r.Critical, &r.High, &r.Medium, &r.Low,
			&r.CredType, &r.CredAgeDays, &r.Change, &r.OpenAlerts, &r.ARN); err != nil {
			return nil, fmt.Errorf("scan identity: %w", err)
		}
		out = append(out, r)
	}
	return out, rows.Err()
}

// List implements GET /identities. It returns the page and the cursor of the
// next page (nil on the last page).
func (r *IdentitiesListRepository) List(ctx context.Context, s *scope.DataScope, f common.IdentityFilter) ([]common.IdentityListItem, *string, error) {
	if err := common.Need(s); err != nil {
		return nil, nil, err
	}
	f.Limit = common.ClampPageLimit(f.Limit)
	if f.Sort == "" {
		f.Sort = common.SortScore
	}
	afterID := ""
	if strings.TrimSpace(f.Cursor) != "" {
		var c identityCursor
		if err := common.DecodeCursor(f.Cursor, &c); err != nil || c.ID == "" || c.Sort != f.Sort {
			return nil, nil, common.ErrMalformedCursor
		}
		afterID = c.ID
	}
	rows, err := r.QueryIdentityPage(ctx, s, f, afterID, f.Limit+1)
	if err != nil {
		return nil, nil, err
	}
	var next *string
	if len(rows) > f.Limit {
		rows = rows[:f.Limit]
		c := common.EncodeCursor(identityCursor{Sort: f.Sort, ID: rows[len(rows)-1].IdentityID})
		next = &c
	}
	items := make([]common.IdentityListItem, 0, len(rows))
	for _, row := range rows {
		items = append(items, row.toItem(f.Window))
	}
	return items, next, nil
}

func (row IdentityRow) toItem(w common.Window) common.IdentityListItem {
	item := common.IdentityListItem{
		IdentityID:      row.IdentityID,
		Name:            row.Name,
		ARN:             row.ARN,
		Type:            row.Type,
		FunctionalClass: common.NullStr(row.Class),
		Account:         common.AccountRef{ID: row.AccountID, Name: row.AccountName},
		Score:           common.NullFloat(row.Score),
		Band:            row.Band,
		Grade:           row.Grade,
		WeakestPillar:   common.NullStr(row.WeakestPillar),
		Failed: common.FailedCounts{
			Total: common.IntVal(row.Failed), Critical: common.IntVal(row.Critical), High: common.IntVal(row.High),
			Medium: common.IntVal(row.Medium), Low: common.IntVal(row.Low),
		},
		Change: common.Change{Window: w.Label, Value: common.NullFloat(row.Change)},
	}
	if row.CredType.Valid && row.CredType.String != "" {
		item.Credential = &common.CredentialBrief{Type: row.CredType.String, AgeDays: common.NullInt(row.CredAgeDays)}
	}
	return item
}
