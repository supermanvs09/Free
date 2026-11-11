package store

import (
	"context"
	"fmt"
	"strings"
	"time"
)

// FindingListFilter narrows ListFindings. Status is OPEN unless set; Stage is
// "" (any), "todo" (no plan in progress), "in_progress" (a guided plan to
// apply) or "waiting_scan" (marked done, waiting for the scan).
type FindingListFilter struct {
	Status   string
	Severity string
	Search   string
	Stage    string
	Limit    int
	Offset   int
}

// FindingRow is one finding of the remediation backlog, with its newest plan
// that is still in progress or waiting for the scan (nil when none).
type FindingRow struct {
	FindingID    string     `json:"finding_id"`
	RuleID       string     `json:"rule_id"`
	RuleName     string     `json:"rule_name"`
	Severity     string     `json:"severity"`
	Status       string     `json:"status"`
	Title        string     `json:"title"`
	IdentityName string     `json:"identity_name"`
	IdentityType string     `json:"identity_type"`
	AccountID    string     `json:"account_id"`
	RiskScore    float64    `json:"risk_score"`
	FirstSeen    time.Time  `json:"first_seen"`
	ResolvedAt   *time.Time `json:"resolved_at"`
	Plan         *PlanRef   `json:"plan"`
}

type PlanRef struct {
	PlanID string `json:"plan_id"`
	Status string `json:"status"`
}

// FindingSummary is the backlog at a glance: open findings by severity and
// by stage, and findings the scan confirmed fixed in the last 30 days.
type FindingSummary struct {
	Open        int            `json:"open"`
	BySeverity  map[string]int `json:"by_severity"`
	ToDo        int            `json:"to_do"`
	InProgress  int            `json:"in_progress"`
	WaitingScan int            `json:"waiting_scan"`
	Fixed30d    int            `json:"fixed_30d"`
}

const activePlanStatuses = `('DRAFT','READY','WAITING_EXTERNAL','MANUALLY_DONE')`

// planJoin finds a finding's newest guided plan that is in progress or waiting for the scan.
func (s *Store) planJoin() string {
	return fmt.Sprintf(`LEFT JOIN LATERAL (SELECT p.plan_id::text AS plan_id, p.status FROM %s p
		WHERE p.tenant_id = f.tenant_id AND f.finding_id = ANY(p.finding_ids) AND p.status IN %s
		ORDER BY p.created_at DESC LIMIT 1) ap ON true`, s.tbl("remediation_plans"), activePlanStatuses)
}

// ListFindings is the remediation backlog: findings worst first (severity, then risk score).
func (s *Store) ListFindings(ctx context.Context, f FindingListFilter) ([]FindingRow, int, error) {
	where := []string{"f.tenant_id = $1::uuid"}
	args := []any{s.TenantID}
	add := func(cond string, v any) {
		args = append(args, v)
		where = append(where, strings.ReplaceAll(cond, "?", fmt.Sprintf("$%d", len(args))))
	}
	status := strings.ToUpper(strings.TrimSpace(f.Status))
	if status == "" {
		status = "OPEN"
	}
	if status != "ALL" {
		add("f.status = ?", status)
	}
	if f.Severity != "" {
		add("lower(f.severity) = lower(?)", f.Severity)
	}
	if q := strings.TrimSpace(f.Search); q != "" {
		add("(f.identity_name ILIKE ? OR f.title ILIKE $X OR f.rule_id ILIKE $X OR f.rule_name ILIKE $X)", "%"+escapeLike(q)+"%")
		where[len(where)-1] = strings.ReplaceAll(where[len(where)-1], "$X", fmt.Sprintf("$%d", len(args)))
	}
	switch f.Stage {
	case "todo":
		where = append(where, "ap.plan_id IS NULL")
	case "in_progress":
		where = append(where, "ap.status IN ('DRAFT','READY','WAITING_EXTERNAL')")
	case "waiting_scan":
		where = append(where, "ap.status = 'MANUALLY_DONE'")
	}
	from := fmt.Sprintf(`FROM %s f %s WHERE %s`, s.tbl("ispm_nhi_findings"), s.planJoin(), strings.Join(where, " AND "))

	var total int
	if err := s.pool.QueryRow(ctx, "SELECT count(*) "+from, args...).Scan(&total); err != nil {
		return nil, 0, err
	}
	limit := f.Limit
	if limit <= 0 || limit > 200 {
		limit = 50
	}
	q := `SELECT f.finding_id::text, f.rule_id, COALESCE(f.rule_name,''), f.severity, f.status, COALESCE(f.title,''),
		COALESCE(f.identity_name,''), COALESCE(f.identity_type,''), COALESCE(f.account_id,''), COALESCE(f.risk_score,0)::float8,
		f.first_seen, f.resolved_at, ap.plan_id, ap.status ` + from + `
		ORDER BY CASE lower(f.severity) WHEN 'critical' THEN 0 WHEN 'high' THEN 1 WHEN 'medium' THEN 2 ELSE 3 END,
			f.risk_score DESC, f.first_seen, f.finding_id
		LIMIT ` + fmt.Sprint(limit) + ` OFFSET ` + fmt.Sprint(max(0, f.Offset))
	rows, err := s.pool.Query(ctx, q, args...)
	if err != nil {
		return nil, 0, err
	}
	defer rows.Close()
	out := []FindingRow{}
	for rows.Next() {
		var r FindingRow
		var planID, planStatus *string
		if err := rows.Scan(&r.FindingID, &r.RuleID, &r.RuleName, &r.Severity, &r.Status, &r.Title, &r.IdentityName,
			&r.IdentityType, &r.AccountID, &r.RiskScore, &r.FirstSeen, &r.ResolvedAt, &planID, &planStatus); err != nil {
			return nil, 0, err
		}
		if planID != nil {
			r.Plan = &PlanRef{PlanID: *planID, Status: *planStatus}
		}
		out = append(out, r)
	}
	return out, total, rows.Err()
}

// FindingsSummary counts the backlog for the remediation page's cards.
func (s *Store) FindingsSummary(ctx context.Context) (*FindingSummary, error) {
	sum := &FindingSummary{BySeverity: map[string]int{}}
	rows, err := s.pool.Query(ctx, fmt.Sprintf(`SELECT initcap(lower(f.severity)),
			count(*) FILTER (WHERE ap.plan_id IS NULL),
			count(*) FILTER (WHERE ap.status IN ('DRAFT','READY','WAITING_EXTERNAL')),
			count(*) FILTER (WHERE ap.status = 'MANUALLY_DONE'),
			count(*)
		FROM %s f %s WHERE f.tenant_id = $1::uuid AND f.status = 'OPEN' GROUP BY 1`, s.tbl("ispm_nhi_findings"), s.planJoin()), s.TenantID)
	if err != nil {
		return nil, err
	}
	defer rows.Close()
	for rows.Next() {
		var sev string
		var todo, prog, wait, all int
		if err := rows.Scan(&sev, &todo, &prog, &wait, &all); err != nil {
			return nil, err
		}
		sum.BySeverity[sev] += all
		sum.Open += all
		sum.ToDo += todo
		sum.InProgress += prog
		sum.WaitingScan += wait
	}
	if err := rows.Err(); err != nil {
		return nil, err
	}
	err = s.pool.QueryRow(ctx, fmt.Sprintf(`SELECT count(*) FROM %s WHERE tenant_id = $1::uuid AND status = 'RESOLVED'
		AND COALESCE(resolved_at, updated_at) > now() - interval '30 days'`, s.tbl("ispm_nhi_findings")), s.TenantID).Scan(&sum.Fixed30d)
	return sum, err
}

func escapeLike(s string) string {
	return strings.NewReplacer(`\`, `\\`, `%`, `\%`, `_`, `\_`).Replace(s)
}
