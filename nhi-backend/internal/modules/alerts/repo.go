// Package alerts serves the Alerts page: identities whose posture score fell at
// the latest sync (with the evidence for why), and credentials exposed in code.
// Everything is read from tables other pages already use; nothing is written.
package alerts

import (
	"context"
	"database/sql"
	"encoding/json"
	"errors"
	"fmt"
	"strings"
	"time"

	"github.com/lib/pq"

	"nhi-backend-api/internal/platform/scope"
)

// Tables (tenant schema).
const (
	tPosture  = "ispm_identity_posture"
	tHourly   = "ispm_identity_posture_hourly"
	tDaily    = "ispm_identity_posture_daily"
	tChecks   = "ispm_identity_checks"
	tRules    = "ispm_rule_weights"
	tFindings = "ispm_nhi_findings"
	tScans    = "ispm_scan_history"
	tChanges  = "scan_changes"
	tIdents   = "identities"
	tIdCreds  = "identity_credentials"
	tCreds    = "credentials"
)

var errNotFound = errors.New("alert not found")

type Repo struct{}

// prevScoreJoin finds, per current posture row p, the score it had at the
// previous sync: the newest hourly capture from another scan (before the
// current computation), else the newest daily snapshot from an earlier day.
func prevScoreJoin(s *scope.DataScope) string {
	return fmt.Sprintf(`CROSS JOIN LATERAL (
		SELECT score, band, captured_at FROM (
			(SELECT h.score, h.band, h.captured_at, 0 AS src FROM %s h
			  WHERE h.tenant_id = p.tenant_id AND h.identity_id = p.identity_id
			    AND h.scan_id IS DISTINCT FROM p.last_scan_id AND h.captured_at < p.computed_at
			  ORDER BY h.captured_at DESC LIMIT 1)
			UNION ALL
			(SELECT d.score, d.band, d.snapshot_date::timestamptz, 1 FROM %s d
			  WHERE d.tenant_id = p.tenant_id AND d.identity_id = p.identity_id
			    AND d.snapshot_date < p.computed_at::date
			  ORDER BY d.snapshot_date DESC LIMIT 1)
		) x ORDER BY src LIMIT 1) prev`, s.Table(tHourly), s.Table(tDaily))
}

func accountsClause(s *scope.DataScope, col string, n int) (string, []any) {
	if len(s.AccountIDs) == 0 {
		return "", nil
	}
	return fmt.Sprintf(" AND %s = ANY($%d::text[])", col, n), []any{pq.Array(s.AccountIDs)}
}

// ScoreDrops lists identities whose score is lower now than at the previous sync.
func (Repo) ScoreDrops(ctx context.Context, s *scope.DataScope) ([]ScoreDrop, error) {
	acc, accArgs := accountsClause(s, "p.account_id", 2)
	q := fmt.Sprintf(`SELECT p.identity_id, COALESCE(p.identity_name,''), COALESCE(p.identity_type,''), COALESCE(p.identity_arn,''),
			COALESCE(p.account_id,''), p.score, COALESCE(p.band,''), COALESCE(p.grade,''), p.computed_at,
			prev.score, COALESCE(prev.band,''), prev.captured_at,
			COALESCE(top.title,''), COALESCE(top.severity,''), COALESCE(top.points,0), COALESCE(cnt.n,0),
			COALESCE(p.failed_critical,0), COALESCE(p.failed_high,0)
		FROM %[1]s p
		%[2]s
		LEFT JOIN LATERAL (
			SELECT COALESCE(NULLIF(w.check_title,''), NULLIF(w.rule_name,''), c.rule_id) AS title, c.severity, c.points_lost AS points
			FROM %[3]s c LEFT JOIN %[4]s w ON w.rule_id = c.rule_id
			WHERE c.tenant_id = p.tenant_id AND c.identity_id = p.identity_id AND upper(c.status) = 'FAIL'
			  AND c.failing_since > prev.captured_at
			ORDER BY c.points_lost DESC NULLS LAST LIMIT 1) top ON true
		LEFT JOIN LATERAL (
			SELECT count(*) AS n FROM %[3]s c
			WHERE c.tenant_id = p.tenant_id AND c.identity_id = p.identity_id AND upper(c.status) = 'FAIL'
			  AND c.failing_since > prev.captured_at) cnt ON true
		WHERE p.tenant_id = $1 AND prev.score > p.score%[5]s
		ORDER BY prev.score - p.score DESC, p.score ASC
		LIMIT 500`, s.Table(tPosture), prevScoreJoin(s), s.Table(tChecks), s.Table(tRules), acc)
	rows, err := s.DB.QueryContext(ctx, q, append([]any{s.TenantID}, accArgs...)...)
	if err != nil {
		if missingTable(err) {
			return []ScoreDrop{}, nil
		}
		return nil, fmt.Errorf("score drops: %w", err)
	}
	defer rows.Close()
	out := []ScoreDrop{}
	for rows.Next() {
		var d ScoreDrop
		if err := rows.Scan(&d.IdentityID, &d.IdentityName, &d.IdentityType, &d.IdentityARN, &d.AccountID,
			&d.ScoreNow, &d.BandNow, &d.Grade, &d.DetectedAt, &d.ScoreBefore, &d.BandBefore, &d.BeforeAt,
			&d.TopReason, &d.TopSeverity, &d.TopPoints, &d.NewFailing, &d.FailedCritical, &d.FailedHigh); err != nil {
			return nil, fmt.Errorf("scan score drop: %w", err)
		}
		d.Delta = d.ScoreNow - d.ScoreBefore
		out = append(out, d)
	}
	return out, rows.Err()
}

// LastSyncs returns the completion times of the two newest finished posture
// scans (zero when unknown).
func (Repo) LastSyncs(ctx context.Context, s *scope.DataScope) (latest, previous time.Time, err error) {
	rows, err := s.DB.QueryContext(ctx, fmt.Sprintf(`SELECT COALESCE(completed_at, started_at) FROM %s
		WHERE tenant_id = $1 AND COALESCE(completed_at, started_at) IS NOT NULL AND lower(COALESCE(status,'')) NOT IN ('failed','running')
		ORDER BY COALESCE(completed_at, started_at) DESC LIMIT 2`, s.Table(tScans)), s.TenantID)
	if err != nil {
		if missingTable(err) {
			return latest, previous, nil
		}
		return latest, previous, fmt.Errorf("last syncs: %w", err)
	}
	defer rows.Close()
	var ts []time.Time
	for rows.Next() {
		var t time.Time
		if err := rows.Scan(&t); err != nil {
			return latest, previous, err
		}
		ts = append(ts, t)
	}
	if len(ts) > 0 {
		latest = ts[0]
	}
	if len(ts) > 1 {
		previous = ts[1]
	}
	return latest, previous, rows.Err()
}

// Identity is the full why-did-it-drop record of one identity.
func (Repo) Identity(ctx context.Context, s *scope.DataScope, id string) (*IdentityAlert, error) {
	acc, accArgs := accountsClause(s, "p.account_id", 3)
	out := &IdentityAlert{Timeline: []ScorePoint{}, NewFailing: []CheckChange{}, StillFailing: []CheckChange{}, NewFindings: []FindingChange{}, Changes: []InventoryChange{}}
	var pillars []byte
	var prevScore sql.NullInt64
	var prevBand sql.NullString
	var prevAt sql.NullTime
	q := fmt.Sprintf(`SELECT p.identity_id, COALESCE(p.identity_name,''), COALESCE(p.identity_type,''), COALESCE(p.identity_arn,''),
			COALESCE(p.account_id,''), COALESCE(p.account_name,''), COALESCE(p.region,''), p.score, COALESCE(p.band,''), COALESCE(p.grade,''),
			COALESCE(p.checks_failed,0), COALESCE(p.checks_evaluated,0), COALESCE(p.points_lost,0), COALESCE(p.why_this_score,''),
			COALESCE(p.weakest_pillar,''), p.pillar_scores, COALESCE(p.credential_arn,''), p.computed_at,
			prev.score, prev.band, prev.captured_at
		FROM %s p
		LEFT JOIN LATERAL (SELECT score, band, captured_at FROM (
			(SELECT h.score, h.band, h.captured_at, 0 AS src FROM %s h
			  WHERE h.tenant_id = p.tenant_id AND h.identity_id = p.identity_id
			    AND h.scan_id IS DISTINCT FROM p.last_scan_id AND h.captured_at < p.computed_at
			  ORDER BY h.captured_at DESC LIMIT 1)
			UNION ALL
			(SELECT d.score, d.band, d.snapshot_date::timestamptz, 1 FROM %s d
			  WHERE d.tenant_id = p.tenant_id AND d.identity_id = p.identity_id AND d.snapshot_date < p.computed_at::date
			  ORDER BY d.snapshot_date DESC LIMIT 1)) x ORDER BY src LIMIT 1) prev ON true
		WHERE p.tenant_id = $1 AND p.identity_id = $2%s`, s.Table(tPosture), s.Table(tHourly), s.Table(tDaily), acc)
	err := s.DB.QueryRowContext(ctx, q, append([]any{s.TenantID, id}, accArgs...)...).Scan(
		&out.IdentityID, &out.IdentityName, &out.IdentityType, &out.IdentityARN, &out.AccountID, &out.AccountName, &out.Region,
		&out.ScoreNow, &out.BandNow, &out.Grade, &out.ChecksFailed, &out.ChecksEvaluated, &out.PointsLost, &out.WhyThisScore,
		&out.WeakestPillar, &pillars, &out.CredentialARN, &out.DetectedAt, &prevScore, &prevBand, &prevAt)
	if errors.Is(err, sql.ErrNoRows) {
		return nil, errNotFound
	}
	if err != nil {
		if missingTable(err) {
			return nil, errNotFound
		}
		return nil, fmt.Errorf("alert identity: %w", err)
	}
	if len(pillars) > 0 {
		out.PillarScores = json.RawMessage(pillars)
	}
	since := time.Time{}
	if prevScore.Valid {
		v := int(prevScore.Int64)
		out.ScoreBefore, out.BandBefore = &v, prevBand.String
		out.BeforeAt = &prevAt.Time
		since = prevAt.Time
	}

	// Score over time: hourly captures, else daily snapshots.
	if err := collect(ctx, s, fmt.Sprintf(`SELECT captured_at, score FROM (
			SELECT captured_at, score FROM %s WHERE tenant_id = $1 AND identity_id = $2 ORDER BY captured_at DESC LIMIT 60) t ORDER BY captured_at`,
		s.Table(tHourly)), []any{s.TenantID, id}, func(r *sql.Rows) error {
		var p ScorePoint
		if err := r.Scan(&p.At, &p.Score); err != nil {
			return err
		}
		out.Timeline = append(out.Timeline, p)
		return nil
	}); err != nil {
		return nil, err
	}
	if len(out.Timeline) < 2 {
		out.Timeline = out.Timeline[:0]
		if err := collect(ctx, s, fmt.Sprintf(`SELECT snapshot_date::timestamptz, score FROM (
				SELECT snapshot_date, score FROM %s WHERE tenant_id = $1 AND identity_id = $2 ORDER BY snapshot_date DESC LIMIT 60) t ORDER BY snapshot_date`,
			s.Table(tDaily)), []any{s.TenantID, id}, func(r *sql.Rows) error {
			var p ScorePoint
			if err := r.Scan(&p.At, &p.Score); err != nil {
				return err
			}
			out.Timeline = append(out.Timeline, p)
			return nil
		}); err != nil {
			return nil, err
		}
	}

	// Failing checks, split into new since the previous sync and older.
	if err := collect(ctx, s, fmt.Sprintf(`SELECT c.rule_id, COALESCE(NULLIF(w.check_title,''), NULLIF(w.rule_name,''), c.rule_id),
			COALESCE(w.description,''), COALESCE(c.severity,''), COALESCE(c.points_lost,0), COALESCE(c.detail,''),
			c.failing_since, COALESCE(c.pillar_code,''), COALESCE(c.category_code,''), c.finding_id::text
		FROM %s c LEFT JOIN %s w ON w.rule_id = c.rule_id
		WHERE c.tenant_id = $1 AND c.identity_id = $2 AND upper(c.status) = 'FAIL'
		ORDER BY c.points_lost DESC NULLS LAST, c.failing_since DESC NULLS LAST`, s.Table(tChecks), s.Table(tRules)),
		[]any{s.TenantID, id}, func(r *sql.Rows) error {
			var c CheckChange
			var since0 sql.NullTime
			var fid sql.NullString
			if err := r.Scan(&c.RuleID, &c.Title, &c.Description, &c.Severity, &c.Points, &c.Detail, &since0, &c.Pillar, &c.Category, &fid); err != nil {
				return err
			}
			if since0.Valid {
				c.FailingSince = &since0.Time
			}
			c.FindingID = fid.String
			if !since.IsZero() && since0.Valid && since0.Time.After(since) {
				out.NewFailing = append(out.NewFailing, c)
			} else {
				out.StillFailing = append(out.StillFailing, c)
			}
			return nil
		}); err != nil {
		return nil, err
	}

	// Findings opened since the previous sync.
	if !since.IsZero() {
		if err := collect(ctx, s, fmt.Sprintf(`SELECT finding_id::text, COALESCE(rule_id,''), COALESCE(title, rule_name, ''), COALESCE(severity,''),
				COALESCE(risk_explanation,''), COALESCE(remediation,''), evidence, first_seen, COALESCE(credential_arn,'')
			FROM %s WHERE tenant_id = $1 AND identity_id = $2 AND upper(status) = 'OPEN' AND first_seen > $3
			ORDER BY first_seen DESC LIMIT 50`, s.Table(tFindings)), []any{s.TenantID, id, since}, func(r *sql.Rows) error {
			var f FindingChange
			var ev []byte
			if err := r.Scan(&f.FindingID, &f.RuleID, &f.Title, &f.Severity, &f.RiskExplanation, &f.Remediation, &ev, &f.FirstSeen, &f.CredentialARN); err != nil {
				return err
			}
			if len(ev) > 0 && string(ev) != "null" {
				f.Evidence = json.RawMessage(ev)
			}
			out.NewFindings = append(out.NewFindings, f)
			return nil
		}); err != nil {
			return nil, err
		}

		// Inventory changes to the identity or the credentials it signs in with.
		if out.IdentityARN != "" {
			if err := collect(ctx, s, fmt.Sprintf(`SELECT change_type, COALESCE(entity_type,''), COALESCE(entity_arn,''), COALESCE(summary,''), details, detected_at
				FROM %s WHERE detected_at > $2 AND entity_arn IN (
					SELECT $1::text UNION SELECT NULLIF($3::text,'')
					UNION SELECT c.arn FROM %s i JOIN %s ic ON ic.identity_id::text = i.id::text
					  JOIN %s c ON c.id::text = ic.credential_id::text WHERE i.arn = $1)
				ORDER BY detected_at DESC LIMIT 50`, s.Table(tChanges), s.Table(tIdents), s.Table(tIdCreds), s.Table(tCreds)),
				[]any{out.IdentityARN, since, out.CredentialARN}, func(r *sql.Rows) error {
					var c InventoryChange
					var d []byte
					if err := r.Scan(&c.ChangeType, &c.EntityType, &c.EntityARN, &c.Summary, &d, &c.DetectedAt); err != nil {
						return err
					}
					if len(d) > 0 && string(d) != "null" {
						c.Details = json.RawMessage(d)
					}
					out.Changes = append(out.Changes, c)
					return nil
				}); err != nil {
				return nil, err
			}
		}
	}

	// The discovery record, for "open identity".
	if out.IdentityARN != "" {
		var did sql.NullString
		err := s.DB.QueryRowContext(ctx, fmt.Sprintf(`SELECT id::text FROM %s WHERE arn = $1 AND deleted_at IS NULL ORDER BY updated_at DESC NULLS LAST LIMIT 1`, s.Table(tIdents)), out.IdentityARN).Scan(&did)
		if err == nil {
			out.DiscoveryID = did.String
		} else if !errors.Is(err, sql.ErrNoRows) && !missingTable(err) {
			return nil, fmt.Errorf("discovery id: %w", err)
		}
	}
	return out, nil
}

// collect runs q and hands each row to scan. A missing table yields nothing.
func collect(ctx context.Context, s *scope.DataScope, q string, args []any, scan func(*sql.Rows) error) error {
	rows, err := s.DB.QueryContext(ctx, q, args...)
	if err != nil {
		if missingTable(err) {
			return nil
		}
		return err
	}
	defer rows.Close()
	for rows.Next() {
		if err := scan(rows); err != nil {
			return err
		}
	}
	return rows.Err()
}

func missingTable(err error) bool {
	var pqErr *pq.Error
	if errors.As(err, &pqErr) {
		return pqErr.Code == "42P01"
	}
	return err != nil && (strings.Contains(err.Error(), "SQLSTATE 42P01") || (strings.Contains(err.Error(), "relation") && strings.Contains(err.Error(), "does not exist")))
}
