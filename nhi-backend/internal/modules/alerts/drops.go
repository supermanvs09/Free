package alerts

import (
	"context"
	"database/sql"
	"encoding/json"
	"fmt"
	"regexp"
	"strconv"
	"strings"
	"sync"
	"time"

	"nhi-backend-api/internal/platform/scope"
)

/*
 * The posture service (ISPM) now records a score drop on the posture row
 * itself:
 *
 *   drop_alert      true while the drop is an alert
 *   drop_from_score / drop_to_score / drop_alert_at
 *   drop_reasons    ["Administrator access on NHI role (-25)", ...]
 *   drop_ack_by / drop_ack_at   who acknowledged it, when
 *
 * Those are the alert: the console no longer has to infer drops by comparing
 * history snapshots. A schema whose posture table predates them keeps the
 * history comparison (ScoreDrops falls back).
 */

// dropColumns caches, per tenant schema, whether ispm_identity_posture has
// the drop_* columns. Columns are only ever added, so a true is kept; a false
// is re-checked after dropColumnsRecheck, so a deploy of the posture service
// is picked up without restarting the API.
var dropColumns sync.Map // schema -> dropColumnsEntry

type dropColumnsEntry struct {
	has bool
	at  time.Time
}

const dropColumnsRecheck = 5 * time.Minute

func hasDropColumns(ctx context.Context, s *scope.DataScope) bool {
	if v, ok := dropColumns.Load(s.Schema); ok {
		e := v.(dropColumnsEntry)
		if e.has || time.Since(e.at) < dropColumnsRecheck {
			return e.has
		}
	}
	var n int
	err := s.DB.QueryRowContext(ctx, `SELECT count(*) FROM information_schema.columns
		WHERE table_schema = $1 AND table_name = $2 AND column_name IN ('drop_alert','drop_from_score','drop_to_score','drop_alert_at','drop_reasons')`,
		s.Schema, tPosture).Scan(&n)
	has := err == nil && n == 5
	if err == nil {
		dropColumns.Store(s.Schema, dropColumnsEntry{has: has, at: time.Now()})
	}
	return has
}

// pointsInReason reads the "(-25)" at the end of a drop reason.
var pointsInReason = regexp.MustCompile(`\(\s*[-−]?\s*(\d+)\s*(?:points?|pts)?\s*\)\s*$`)

// splitReason turns "Administrator access on NHI role (-25)" into its text
// and the points it cost (0 when the reason names none).
func splitReason(r string) (string, int) {
	r = strings.TrimSpace(r)
	m := pointsInReason.FindStringSubmatchIndex(r)
	if m == nil {
		return r, 0
	}
	n, _ := strconv.Atoi(r[m[2]:m[3]])
	return strings.TrimSpace(r[:m[0]]), n
}

// parseReasons reads drop_reasons as stored: a JSON array (jsonb or text[]
// through to_jsonb), or a JSON string holding one, or a single reason.
func parseReasons(raw sql.NullString) []string {
	if !raw.Valid || raw.String == "" || raw.String == "null" {
		return nil
	}
	var list []string
	if json.Unmarshal([]byte(raw.String), &list) == nil {
		return compact(list)
	}
	var one string
	if json.Unmarshal([]byte(raw.String), &one) == nil {
		if json.Unmarshal([]byte(one), &list) == nil {
			return compact(list)
		}
		return compact([]string{one})
	}
	return compact([]string{raw.String})
}

func compact(in []string) []string {
	out := in[:0]
	for _, s := range in {
		if s = strings.TrimSpace(s); s != "" {
			out = append(out, s)
		}
	}
	return out
}

// scoreDropsFromPosture lists the posture rows the posture service marked as
// a drop alert.
func scoreDropsFromPosture(ctx context.Context, s *scope.DataScope) ([]ScoreDrop, error) {
	acc, accArgs := accountsClause(s, "p.account_id", 2)
	q := fmt.Sprintf(`SELECT p.identity_id, COALESCE(p.identity_name,''), COALESCE(p.identity_type,''), COALESCE(p.identity_arn,''),
			COALESCE(p.account_id,''), COALESCE(p.drop_to_score, p.score), COALESCE(p.band,''), COALESCE(p.grade,''),
			COALESCE(p.drop_alert_at, p.computed_at), p.drop_from_score,
			to_jsonb(p.drop_reasons)::text, p.drop_ack_by::text, p.drop_ack_at,
			COALESCE(p.failed_critical,0), COALESCE(p.failed_high,0)
		FROM %s p
		WHERE p.tenant_id = $1 AND p.drop_alert IS TRUE AND p.drop_from_score IS NOT NULL%s
		ORDER BY COALESCE(p.drop_from_score,0) - COALESCE(p.drop_to_score, p.score) DESC, p.score ASC
		LIMIT 500`, s.Table(tPosture), acc)
	rows, err := s.DB.QueryContext(ctx, q, append([]any{s.TenantID}, accArgs...)...)
	if err != nil {
		return nil, fmt.Errorf("score drops: %w", err)
	}
	defer rows.Close()
	out := []ScoreDrop{}
	for rows.Next() {
		var d ScoreDrop
		var reasons, ackBy sql.NullString
		var ackAt sql.NullTime
		if err := rows.Scan(&d.IdentityID, &d.IdentityName, &d.IdentityType, &d.IdentityARN, &d.AccountID,
			&d.ScoreNow, &d.BandNow, &d.Grade, &d.DetectedAt, &d.ScoreBefore,
			&reasons, &ackBy, &ackAt, &d.FailedCritical, &d.FailedHigh); err != nil {
			return nil, fmt.Errorf("scan score drop: %w", err)
		}
		d.Delta = d.ScoreNow - d.ScoreBefore
		d.Reasons = parseReasons(reasons)
		d.NewFailing = len(d.Reasons)
		if len(d.Reasons) > 0 {
			d.TopReason, d.TopPoints = splitReason(d.Reasons[0])
		}
		d.AckBy = ackBy.String
		if ackAt.Valid {
			t := ackAt.Time
			d.AckAt = &t
		}
		out = append(out, d)
	}
	return out, rows.Err()
}

// CriticalIdentity is an identity whose posture is in the critical band: the
// list the Posture page shows under its Critical filter.
type CriticalIdentity struct {
	IdentityID   string
	IdentityName string
	IdentityType string
	AccountID    string
	Score        int
	Since        time.Time // when it entered the critical band (stable across syncs)
	ChecksFailed int
	TopCheck     string
	TopPoints    int
}

// CriticalPosture lists identities in the critical band. Since is the first
// daily snapshot of the current critical stretch, so a sync that keeps it
// critical does not make it new again; the posture row's time when there is
// no history.
func (Repo) CriticalPosture(ctx context.Context, s *scope.DataScope) ([]CriticalIdentity, error) {
	acc, accArgs := accountsClause(s, "p.account_id", 2)
	q := fmt.Sprintf(`SELECT p.identity_id, COALESCE(p.identity_name,''), COALESCE(p.identity_type,''), COALESCE(p.account_id,''),
			p.score, COALESCE(p.checks_failed,0),
			COALESCE((SELECT min(d.snapshot_date)::timestamptz FROM %[2]s d
				WHERE d.tenant_id = p.tenant_id AND d.identity_id = p.identity_id AND lower(COALESCE(d.band,'')) = 'critical'
				  AND d.snapshot_date > COALESCE((SELECT max(o.snapshot_date) FROM %[2]s o
					WHERE o.tenant_id = p.tenant_id AND o.identity_id = p.identity_id AND lower(COALESCE(o.band,'')) <> 'critical'), '-infinity'::date)),
				p.computed_at),
			COALESCE(top.title,''), COALESCE(top.points,0)
		FROM %[1]s p
		LEFT JOIN LATERAL (
			SELECT COALESCE(NULLIF(w.check_title,''), NULLIF(w.rule_name,''), c.rule_id) AS title, c.points_lost AS points
			FROM %[3]s c LEFT JOIN %[4]s w ON w.rule_id = c.rule_id
			WHERE c.tenant_id = p.tenant_id AND c.identity_id = p.identity_id AND upper(c.status) IN ('FAIL','FAILED')
			ORDER BY c.points_lost DESC NULLS LAST LIMIT 1) top ON true
		WHERE p.tenant_id = $1 AND lower(COALESCE(p.band,'')) = 'critical'%[5]s
		ORDER BY p.score ASC, p.identity_name
		LIMIT 500`, s.Table(tPosture), s.Table(tDaily), s.Table(tChecks), s.Table(tRules), acc)
	rows, err := s.DB.QueryContext(ctx, q, append([]any{s.TenantID}, accArgs...)...)
	if err != nil {
		if missingTable(err) {
			return []CriticalIdentity{}, nil
		}
		return nil, fmt.Errorf("critical posture: %w", err)
	}
	defer rows.Close()
	out := []CriticalIdentity{}
	for rows.Next() {
		var c CriticalIdentity
		if err := rows.Scan(&c.IdentityID, &c.IdentityName, &c.IdentityType, &c.AccountID, &c.Score, &c.ChecksFailed, &c.Since, &c.TopCheck, &c.TopPoints); err != nil {
			return nil, fmt.Errorf("scan critical posture: %w", err)
		}
		out = append(out, c)
	}
	return out, rows.Err()
}

// identityDrop reads the posture service's drop record of one identity into
// out. Nothing is changed when the drop columns are absent or no drop is open.
func identityDrop(ctx context.Context, s *scope.DataScope, out *IdentityAlert) error {
	if !hasDropColumns(ctx, s) {
		return nil
	}
	var alert sql.NullBool
	var from, to sql.NullInt64
	var at, ackAt sql.NullTime
	var reasons, ackBy sql.NullString
	err := s.DB.QueryRowContext(ctx, fmt.Sprintf(`SELECT p.drop_alert, p.drop_from_score, p.drop_to_score, p.drop_alert_at,
			to_jsonb(p.drop_reasons)::text, p.drop_ack_by::text, p.drop_ack_at
		FROM %s p WHERE p.tenant_id = $1 AND p.identity_id = $2`, s.Table(tPosture)), s.TenantID, out.IdentityID).
		Scan(&alert, &from, &to, &at, &reasons, &ackBy, &ackAt)
	if err != nil {
		if err == sql.ErrNoRows {
			return nil
		}
		return fmt.Errorf("posture drop: %w", err)
	}
	if !alert.Valid || !alert.Bool || !from.Valid {
		return nil
	}
	v := int(from.Int64)
	out.ScoreBefore = &v
	if to.Valid {
		out.ScoreNow = int(to.Int64)
	}
	if at.Valid {
		out.DetectedAt = at.Time
	}
	out.DropAlert = true
	for _, r := range parseReasons(reasons) {
		text, pts := splitReason(r)
		out.DropReasons = append(out.DropReasons, DropReason{Text: text, Points: pts})
	}
	out.AckBy = ackBy.String
	if ackAt.Valid {
		t := ackAt.Time
		out.AckAt = &t
	}
	return nil
}
