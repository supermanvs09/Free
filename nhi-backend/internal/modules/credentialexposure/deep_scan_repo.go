package credentialexposure

import (
	"context"
	"database/sql"
	"errors"
	"fmt"
	"time"

	"github.com/jackc/pgx/v5/pgconn"

	"nhi-backend-api/internal/platform/scope"
)

type DeepScanRepository struct{}

func NewDeepScanRepository() *DeepScanRepository { return &DeepScanRepository{} }

// Status reads one deep scan (secscan_deepscan_<platform>, row deepKey) and
// the ledger state of the branch it walks (row ledgerKey: "<repo>" for the
// default branch, "<repo>:<branch>" for another), per platform that has
// either. platform "" reads every platform.
func (r *DeepScanRepository) Status(ctx context.Context, resolved *scope.DataScope, clientID, deepKey, ledgerKey, platform string) ([]DeepScanResult, error) {
	cat, err := loadCatalog(ctx, resolved)
	if err != nil {
		return nil, err
	}
	schema := resolved.QSchema()
	out := make([]DeepScanResult, 0, 1)
	for _, p := range ScannerPlatforms {
		if platform != "" && platform != p {
			continue
		}
		var item *DeepScanResult
		if t := "secscan_deepscan_" + p; cat.has(t) {
			row := resolved.DB.QueryRowContext(ctx, `SELECT client_id, repo_key, requested_at, completed_at, commits_scanned, findings, failed_at, error
				FROM `+schema+`.`+t+` WHERE client_id=$1 AND repo_key=$2`, clientID, deepKey)
			got, err := scanDeepRow(row, p)
			switch {
			case err == nil:
				item = got
			case errors.Is(err, sql.ErrNoRows):
			default:
				return nil, fmt.Errorf("query deep scan status: %w", err)
			}
		}
		if t := "secscan_ledger_" + p; cat.has(t) {
			var last, updated, pending, since sql.NullString
			err := resolved.DB.QueryRowContext(ctx, `SELECT last_commit_id, updated_at, pending_commit_id, pending_since
				FROM `+schema+`.`+t+` WHERE client_id=$1 AND repo_key=$2`, clientID, ledgerKey).Scan(&last, &updated, &pending, &since)
			switch {
			case err == nil:
				if item == nil {
					item = &DeepScanResult{ClientID: clientID, RepoKey: deepKey, Platform: p, Status: "not_started"}
				}
				item.LastCommitID, item.UpdatedAt = strPtr(last), scannerTimePtr(strPtr(updated))
				item.PendingCommitID, item.PendingSince = strPtr(pending), scannerTimePtr(strPtr(since))
			case errors.Is(err, sql.ErrNoRows):
			default:
				return nil, fmt.Errorf("query scan ledger: %w", err)
			}
		}
		if item != nil {
			out = append(out, *item)
		}
	}
	return out, nil
}

// ErrDeepScanClientMissing: this tenant's scanner tables have never seen the
// client, so there is no credential the worker could scan it with.
var ErrDeepScanClientMissing = errors.New("deep scan: unknown client_id")

// ClientPlatforms returns the platforms on which this tenant's scanner has a
// ledger row or a finding for clientID.
func (r *DeepScanRepository) ClientPlatforms(ctx context.Context, resolved *scope.DataScope, clientID string) ([]string, error) {
	cat, err := loadCatalog(ctx, resolved)
	if err != nil {
		return nil, err
	}
	schema := resolved.QSchema()
	var out []string
	for _, p := range ScannerPlatforms {
		checks := []string{}
		if t := "secscan_ledger_" + p; cat.has(t) {
			checks = append(checks, `EXISTS (SELECT 1 FROM `+schema+`.`+t+` f WHERE client_id = $1)`)
		}
		for _, kind := range []string{kindFindings, kindDeepFindings} {
			if pt, ok := cat.platformTable(kind, p); ok {
				cond := ""
				if pt.where != "" {
					cond = " AND " + pt.where
				}
				checks = append(checks, `EXISTS (SELECT 1 FROM `+schema+`.`+pt.table+` f WHERE client_id = $1`+cond+`)`)
			}
		}
		if len(checks) == 0 {
			continue
		}
		var known bool
		q := `SELECT ` + checks[0]
		for _, c := range checks[1:] {
			q += ` OR ` + c
		}
		if err := resolved.DB.QueryRowContext(ctx, q, clientID).Scan(&known); err != nil {
			if isMissingRelation(err) {
				forgetCatalog(resolved.Schema)
				continue
			}
			return nil, fmt.Errorf("look up scanner client: %w", err)
		}
		if known {
			out = append(out, p)
		}
	}
	return out, nil
}

// Request asks the scanner worker for a full-history walk by writing a
// secscan_deepscan_<platform> row (repoKey "<repo>" for the default branch as
// before, "<repo>:<branch>" for a chosen branch): requested_at set, the last
// run's result cleared. The worker picks up rows with requested_at set and
// neither completed_at nor failed_at (README, "Deep-scan contract"). A walk
// already waiting or running is left alone and reported as such - one
// statement, so two clicks never reset each other.
func (r *DeepScanRepository) Request(ctx context.Context, resolved *scope.DataScope, clientID, repoKey, platform string, now time.Time) (requestedAt string, alreadyRunning bool, err error) {
	cat, err := loadCatalog(ctx, resolved)
	if err != nil {
		return "", false, err
	}
	table := "secscan_deepscan_" + platform
	if !validPlatform(platform) || platform == "" {
		return "", false, fmt.Errorf("deep scan: unsupported platform %q", platform)
	}
	if !cat.has(table) {
		return "", false, ErrDeepScanUnavailable
	}
	qt := resolved.QSchema() + `.` + table
	q := `INSERT INTO ` + qt + ` AS d (client_id, repo_key, platform, requested_at)
	      VALUES ($1, $2, $3, $4)
	      ON CONFLICT (client_id, repo_key, platform) DO UPDATE
	         SET requested_at = EXCLUDED.requested_at, completed_at = NULL, commits_scanned = NULL,
	             findings = NULL, failed_at = NULL, error = NULL
	       WHERE d.completed_at IS NOT NULL OR d.failed_at IS NOT NULL
	      RETURNING d.requested_at`
	err = resolved.DB.QueryRowContext(ctx, q, clientID, repoKey, platform, dashboardTimestamp(now)).Scan(&requestedAt)
	if err == nil {
		return scannerTime(requestedAt), false, nil
	}
	if isMissingRelation(err) {
		forgetCatalog(resolved.Schema)
		return "", false, ErrDeepScanUnavailable
	}
	if !errors.Is(err, sql.ErrNoRows) {
		return "", false, fmt.Errorf("request deep scan: %w", err)
	}
	// The conflict row is still waiting or running: report its request time.
	if err := resolved.DB.QueryRowContext(ctx, `SELECT requested_at FROM `+qt+`
	      WHERE client_id = $1 AND repo_key = $2 AND platform = $3`, clientID, repoKey, platform).Scan(&requestedAt); err != nil {
		return "", false, fmt.Errorf("read running deep scan: %w", err)
	}
	return scannerTime(requestedAt), true, nil
}

// ErrDeepScanUnavailable: the tenant schema has no deep-scan table for that
// platform (the scanner has not been set up for it here).
var ErrDeepScanUnavailable = errors.New("deep scan: no deep-scan table for this platform")

// isMissingRelation reports undefined_table (42P01).
func isMissingRelation(err error) bool {
	var pgErr *pgconn.PgError
	return errors.As(err, &pgErr) && pgErr.Code == "42P01"
}
