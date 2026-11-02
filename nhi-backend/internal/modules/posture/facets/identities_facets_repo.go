package facets

import (
	"context"
	"fmt"
	"strings"

	"nhi-backend-api/internal/modules/posture/common"
	"nhi-backend-api/internal/modules/posture/identitylist"
	"nhi-backend-api/internal/platform/scope"
)

type IdentitiesFacetsRepository struct{}

func NewIdentitiesFacetsRepository() *IdentitiesFacetsRepository {
	return &IdentitiesFacetsRepository{}
}

// Get implements GET /identities/facets in one round trip: a UNION ALL of
// count(*) FILTER (…) and GROUP BY branches over ispm_identity_posture. Each
// branch ignores the filter of its own facet so the alternatives stay visible.
func (r *IdentitiesFacetsRepository) Get(ctx context.Context, s *scope.DataScope, f common.IdentityFilter) (*IdentityFacets, error) {
	if err := common.Need(s); err != nil {
		return nil, err
	}
	b := identitylist.NewQueryBuilder(s)
	frags := b.BuildFragments(s, f)
	table := s.Table(common.TIdentityPosture)

	var branches []string
	// total: every filter applies
	branches = append(branches, fmt.Sprintf(
		`SELECT 'total'::text AS facet, ''::text AS k, ''::text AS name, count(*)::bigint AS n FROM %s p WHERE %s`,
		table, identitylist.WhereExcept(frags, "")))
	// band
	branches = append(branches, fmt.Sprintf(
		`SELECT 'band', p.band::text, ''::text, count(*)::bigint FROM %s p WHERE %s AND p.band IS NOT NULL GROUP BY p.band`,
		table, identitylist.WhereExcept(frags, identitylist.FacetBand)))
	// severity: identities failing at least one check of that severity
	for _, sev := range common.Severities {
		branches = append(branches, fmt.Sprintf(
			`SELECT 'severity', '%s'::text, ''::text, count(*) FILTER (WHERE COALESCE(%s, 0) > 0)::bigint FROM %s p WHERE %s`,
			sev, identitylist.SeverityColumn[strings.ToLower(sev)], table, identitylist.WhereExcept(frags, identitylist.FacetSeverity)))
	}
	// dynamic facets
	branches = append(branches,
		fmt.Sprintf(`SELECT 'category', p.functional_class::text, ''::text, count(*)::bigint FROM %s p WHERE %s AND p.functional_class IS NOT NULL AND p.functional_class <> '' GROUP BY p.functional_class`,
			table, identitylist.WhereExcept(frags, identitylist.FacetCategory)),
		fmt.Sprintf(`SELECT 'account', p.account_id::text, COALESCE(max(p.account_name), '')::text, count(*)::bigint FROM %s p WHERE %s AND p.account_id IS NOT NULL GROUP BY p.account_id`,
			table, identitylist.WhereExcept(frags, identitylist.FacetAccount)),
		fmt.Sprintf(`SELECT 'type', p.identity_type::text, ''::text, count(*)::bigint FROM %s p WHERE %s AND p.identity_type IS NOT NULL GROUP BY p.identity_type`,
			table, identitylist.WhereExcept(frags, identitylist.FacetType)),
		fmt.Sprintf(`SELECT 'pillar', p.weakest_pillar::text, ''::text, count(*)::bigint FROM %s p WHERE %s AND p.weakest_pillar IS NOT NULL AND p.weakest_pillar <> '' GROUP BY p.weakest_pillar`,
			table, identitylist.WhereExcept(frags, identitylist.FacetPillar)),
	)
	// changed: down / up / same, by the window's score_change column
	col := "p." + f.Window.ChangeColumn
	branches = append(branches, fmt.Sprintf(
		`SELECT 'changed', 'down'::text, ''::text, count(*) FILTER (WHERE %[1]s < 0)::bigint FROM %[2]s p WHERE %[3]s
		 UNION ALL SELECT 'changed', 'up'::text, ''::text, count(*) FILTER (WHERE %[1]s > 0)::bigint FROM %[2]s p WHERE %[3]s
		 UNION ALL SELECT 'changed', 'same'::text, ''::text, count(*) FILTER (WHERE %[1]s = 0)::bigint FROM %[2]s p WHERE %[3]s`,
		col, table, identitylist.WhereExcept(frags, identitylist.FacetChanged)))

	out := &IdentityFacets{
		Band:     map[string]int{},
		Severity: map[string]int{},
		Category: map[string]int{},
		Account:  map[string]AccountFacet{},
		Type:     map[string]int{},
		Pillar:   map[string]int{},
		Changed:  map[string]int{common.ChangedDown: 0, common.ChangedUp: 0, common.ChangedSame: 0},
	}
	for _, band := range common.Bands {
		out.Band[band] = 0
	}
	for _, sev := range common.Severities {
		out.Severity[sev] = 0
	}
	rows, err := s.DB.QueryContext(ctx, strings.Join(branches, "\nUNION ALL\n"), b.Args...)
	if common.IsUndefinedTable(err) { // no posture evaluation has run for this tenant yet
		return out, nil
	}
	if err != nil {
		return nil, fmt.Errorf("query facets: %w", err)
	}
	defer rows.Close()

	for rows.Next() {
		var facet, key, name string
		var n int64
		if err := rows.Scan(&facet, &key, &name, &n); err != nil {
			return nil, fmt.Errorf("scan facet: %w", err)
		}
		switch facet {
		case "total":
			out.Total = int(n)
		case identitylist.FacetBand:
			out.Band[key] = int(n)
		case identitylist.FacetSeverity:
			out.Severity[key] = int(n)
		case identitylist.FacetCategory:
			out.Category[key] = int(n)
		case identitylist.FacetAccount:
			out.Account[key] = AccountFacet{Name: name, Count: int(n)}
		case identitylist.FacetType:
			out.Type[key] = int(n)
		case identitylist.FacetPillar:
			out.Pillar[key] = int(n)
		case identitylist.FacetChanged:
			out.Changed[key] = int(n)
		}
	}
	return out, rows.Err()
}
